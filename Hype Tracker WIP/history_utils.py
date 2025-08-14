import os
import pandas as pd
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List
import config

def get_current_date() -> str:
    """Get current date in YYYY-MM-DD format"""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")

def get_current_timestamp() -> str:
    """Get current timestamp in ISO format"""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

def save_daily_summary(summary_df: pd.DataFrame) -> None:
    """
    Save daily summary with date tracking for historical comparison.
    Each day gets one entry per ticker with the day's aggregated stats.
    """
    if summary_df.empty:
        print("⚠️ No summary data to save")
        return

    # Add date tracking
    today = get_current_date()
    timestamp = get_current_timestamp()
    
    daily_entry = summary_df.copy()
    daily_entry["date"] = today
    daily_entry["timestamp"] = timestamp
    
    # Load existing daily summaries
    if config.DAILY_SUMMARIES_CSV.exists():
        try:
            existing = pd.read_csv(config.DAILY_SUMMARIES_CSV)
            
            # Remove today's data if it exists (allows re-running on same day)
            existing = existing[existing["date"] != today]
            
            # Combine with new data
            combined = pd.concat([existing, daily_entry], ignore_index=True)
            
        except Exception as e:
            print(f"⚠️ Error reading existing daily summaries: {e}")
            combined = daily_entry
    else:
        combined = daily_entry
    
    # Clean up old data (keep only last N days)
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=config.MAX_DAILY_SUMMARIES_DAYS)).strftime("%Y-%m-%d")
    combined = combined[combined["date"] >= cutoff_date]
    
    # Save
    combined.to_csv(config.DAILY_SUMMARIES_CSV, index=False)
    print(f"✅ Daily summary saved ({len(daily_entry)} tickers, {len(combined)} total historical records)")

def calculate_baseline_mentions(ticker: str, days_back: int = None) -> float:
    """
    Calculate baseline mentions for a ticker over the last N days.
    Returns average daily mentions, or 0 if no historical data.
    """
    if days_back is None:
        days_back = config.BASELINE_DAYS
    
    if not config.DAILY_SUMMARIES_CSV.exists():
        return 0.0
    
    try:
        history = pd.read_csv(config.DAILY_SUMMARIES_CSV)
        
        # Filter for this ticker and recent dates
        cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%d")
        ticker_history = history[
            (history["ticker"] == ticker) & 
            (history["date"] >= cutoff_date) &
            (history["date"] < get_current_date())  # Exclude today
        ]
        
        if ticker_history.empty:
            return 0.0
        
        # Calculate average mentions per day
        avg_mentions = ticker_history["mentions"].mean()
        return max(avg_mentions, 0.0)
        
    except Exception as e:
        print(f"⚠️ Error calculating baseline for {ticker}: {e}")
        return 0.0

def add_percentage_increases(summary_df: pd.DataFrame) -> pd.DataFrame:
    """
    Add percentage increase calculations to summary data.
    Compares today's mentions vs baseline average.
    """
    if summary_df.empty:
        return summary_df
    
    result = summary_df.copy()
    
    # Calculate baselines and percentage increases
    baselines = []
    pct_increases = []
    
    print("📊 Calculating percentage increases vs historical baseline...")
    
    for _, row in result.iterrows():
        ticker = row["ticker"]
        current_mentions = row["mentions"]
        
        # Get baseline (average daily mentions over last N days)
        baseline = calculate_baseline_mentions(ticker)
        baselines.append(baseline)
        
        # Calculate percentage increase
        if baseline == 0:
            # First time seeing this ticker or no historical data
            pct_increase = 999.9 if current_mentions > 0 else 0.0
        else:
            pct_increase = ((current_mentions - baseline) / baseline) * 100
        
        pct_increases.append(round(pct_increase, 1))
    
    result["baseline_mentions"] = baselines
    result["pct_increase"] = pct_increases
    
    # Add significance flags
    result["is_significant"] = result["pct_increase"] >= config.SIGNIFICANT_INCREASE_THRESHOLD
    result["trend_direction"] = result["pct_increase"].apply(
        lambda x: "🚀 Surging" if x >= 100 else 
                 "📈 Rising" if x >= 20 else
                 "➡️ Stable" if x >= -20 else
                 "📉 Declining"
    )
    
    return result

def get_trending_analysis() -> Dict:
    """
    Get summary statistics about current trending patterns.
    """
    if not config.DAILY_SUMMARIES_CSV.exists():
        return {
            "total_tickers_tracked": 0,
            "new_tickers_today": 0,
            "avg_increase": 0.0,
            "significant_increases": 0
        }
    
    try:
        history = pd.read_csv(config.DAILY_SUMMARIES_CSV)
        today = get_current_date()
        
        # Today's data
        today_data = history[history["date"] == today]
        if today_data.empty:
            return {"error": "No data for today"}
        
        # Yesterday's tickers for comparison
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
        yesterday_tickers = set(history[history["date"] == yesterday]["ticker"]) if not history[history["date"] == yesterday].empty else set()
        
        today_tickers = set(today_data["ticker"])
        new_tickers = today_tickers - yesterday_tickers
        
        return {
            "total_tickers_tracked": len(today_tickers),
            "new_tickers_today": len(new_tickers),
            "new_tickers_list": list(new_tickers),
            "avg_increase": today_data["pct_increase"].mean() if "pct_increase" in today_data.columns else 0.0,
            "significant_increases": len(today_data[today_data.get("pct_increase", 0) >= config.SIGNIFICANT_INCREASE_THRESHOLD]),
            "top_gainers": today_data.nlargest(5, "pct_increase")[["ticker", "mentions", "pct_increase"]].to_dict("records") if "pct_increase" in today_data.columns else []
        }
        
    except Exception as e:
        return {"error": f"Analysis failed: {e}"}

def save_raw_mentions(raw_df: pd.DataFrame) -> None:
    """
    Save raw mention data with timestamp for detailed historical tracking.
    This is separate from daily summaries and stores individual post data.
    """
    if raw_df.empty:
        print("⚠️ No raw mentions to save")
        return

    timestamp = get_current_timestamp()
    raw_with_timestamp = raw_df.copy()
    raw_with_timestamp["scrape_timestamp"] = timestamp
    
    # Load existing history if it exists
    if config.MENTIONS_HISTORY_CSV.exists():
        try:
            existing = pd.read_csv(config.MENTIONS_HISTORY_CSV)
            
            # Remove duplicates based on post_id + ticker combination
            combined = pd.concat([existing, raw_with_timestamp], ignore_index=True)
            combined = combined.drop_duplicates(subset=["post_id", "ticker"], keep="last")
            
        except Exception as e:
            print(f"⚠️ Error reading existing history: {e}")
            combined = raw_with_timestamp
    else:
        combined = raw_with_timestamp
    
    # Clean up old data
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=config.MAX_RAW_FILES_DAYS)).strftime("%Y-%m-%d")
    if "scrape_timestamp" in combined.columns:
        combined["scrape_date"] = pd.to_datetime(combined["scrape_timestamp"]).dt.strftime("%Y-%m-%d")
        combined = combined[combined["scrape_date"] >= cutoff_date]
    
    # Save
    combined.to_csv(config.MENTIONS_HISTORY_CSV, index=False)
    print(f"✅ Raw mentions history updated ({len(raw_with_timestamp)} new, {len(combined)} total)")

def cleanup_old_files() -> None:
    """Clean up old raw scrape files to save disk space"""
    try:
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=config.MAX_RAW_FILES_DAYS)
        
        for file_path in config.DATA_DIR.glob("raw_mentions_*.csv"):
            # Extract date from filename (format: raw_mentions_YYYYMMDD_HHMMSS.csv)
            filename = file_path.name
            try:
                date_part = filename.split("_")[2]  # YYYYMMDD
                file_date = datetime.strptime(date_part, "%Y%m%d")
                
                if file_date < cutoff_date:
                    file_path.unlink()
                    print(f"🗑️ Cleaned up old file: {filename}")
                    
            except (IndexError, ValueError):
                # Skip files that don't match expected naming pattern
                continue
                
    except Exception as e:
        print(f"⚠️ Error during cleanup: {e}")

def get_historical_chart_data(ticker: str, days: int = 30) -> List[Dict]:
    """
    Get historical mention data for a specific ticker for charting.
    Returns list of {date, mentions, sentiment} dictionaries.
    """
    if not config.DAILY_SUMMARIES_CSV.exists():
        return []
    
    try:
        history = pd.read_csv(config.DAILY_SUMMARIES_CSV)
        
        cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
        ticker_data = history[
            (history["ticker"] == ticker) & 
            (history["date"] >= cutoff_date)
        ].sort_values("date")
        
        return ticker_data[["date", "mentions", "avg_sentiment"]].to_dict("records")
        
    except Exception as e:
        print(f"⚠️ Error getting chart data for {ticker}: {e}")
        return []

if __name__ == "__main__":
    # Test the functions
    print("Testing historical tracking functions...")
    analysis = get_trending_analysis()
    print(f"Trending analysis: {analysis}")
