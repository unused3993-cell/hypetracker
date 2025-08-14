import re
import time
from datetime import datetime, timezone, timedelta
from typing import Set, Optional, Callable
import pandas as pd
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
import praw

import config
from history_utils import save_daily_summary, save_raw_mentions, add_percentage_increases, cleanup_old_files

# Global state for deduplication
SEEN_POST_IDS: Set[str] = set()

# Compiled regex for performance
TICKER_REGEX = re.compile(r"\b[A-Z]{1,5}\b")

def load_valid_tickers() -> Set[str]:
    """
    Load valid tickers from the master CSV file.
    Returns empty set if file doesn't exist (will fall back to heuristic filtering).
    """
    if not config.TICKERS_MASTER_CSV.exists():
        print(f"⚠️ Ticker master file not found: {config.TICKERS_MASTER_CSV}")
        print("   Using heuristic filtering instead. Run prepare_ticker_master.py to improve accuracy.")
        return set()
    
    try:
        df = pd.read_csv(config.TICKERS_MASTER_CSV)
        
        # Handle different possible column names
        symbol_col = None
        for col in ["symbol", "Symbol", "SYMBOL", "ticker", "Ticker"]:
            if col in df.columns:
                symbol_col = col
                break
        
        if symbol_col is None:
            symbol_col = df.columns[0]  # fallback to first column
            print(f"⚠️ Using first column '{symbol_col}' as ticker symbol")
        
        # Clean and validate tickers
        tickers = set()
        for ticker in df[symbol_col].dropna():
            ticker_clean = str(ticker).strip().upper()
            
            # Basic validation
            if (config.MIN_TICKER_LENGTH <= len(ticker_clean) <= config.MAX_TICKER_LENGTH 
                and ticker_clean.isalpha() 
                and not ticker_clean.startswith("TICK")):  # Remove placeholder entries
                tickers.add(ticker_clean)
        
        print(f"✅ Loaded {len(tickers)} valid tickers from {config.TICKERS_MASTER_CSV}")
        return tickers
        
    except Exception as e:
        print(f"⚠️ Error loading ticker file: {e}")
        return set()

VALID_TICKERS = load_valid_tickers()

def heuristic_filter(token: str) -> bool:
    """
    Heuristic filtering when no ticker master file is available.
    Conservative approach to avoid false positives.
    """
    # Check stop tokens (common false positives)
    if token in config.STOP_TOKENS:
        return False
    
    # Check usual suspects (if filtering enabled)
    if config.EXCLUDE_USUAL_SUSPECTS and token in config.USUAL_SUSPECTS:
        return False
    
    # Single letter tokens need special handling
    if len(token) == 1 and token not in config.SINGLE_LETTER_ALLOWED:
        return False
    
    return True

def extract_tickers(text: str) -> Set[str]:
    """
    Extract potential ticker symbols from text.
    Uses master ticker list if available, otherwise falls back to heuristics.
    """
    if not text:
        return set()
    
    # Find all capitalized words that could be tickers
    candidates = {match.group(0) for match in TICKER_REGEX.finditer(text.upper())}
    
    if VALID_TICKERS:
        # Use master ticker list for validation
        valid_tickers = {ticker for ticker in candidates if ticker in VALID_TICKERS}
        
        # Apply usual suspects filter if enabled
        if config.EXCLUDE_USUAL_SUSPECTS:
            valid_tickers -= config.USUAL_SUSPECTS
            
        return valid_tickers
    else:
        # Fall back to heuristic filtering
        return {ticker for ticker in candidates if heuristic_filter(ticker)}

def get_reddit_client():
    """Initialize Reddit API client with error handling"""
    if not all([config.REDDIT_CLIENT_ID, config.REDDIT_CLIENT_SECRET, config.REDDIT_USER_AGENT]):
        raise RuntimeError(
            "❌ Missing Reddit credentials. Set environment variables:\n"
            "   REDDIT_CLIENT_ID\n"
            "   REDDIT_CLIENT_SECRET\n" 
            "   REDDIT_USER_AGENT"
        )
    
    try:
        client = praw.Reddit(
            client_id=config.REDDIT_CLIENT_ID,
            client_secret=config.REDDIT_CLIENT_SECRET,
            user_agent=config.REDDIT_USER_AGENT,
            ratelimit_seconds=config.RATE_LIMIT_SECONDS
        )
        
        # Test the connection
        _ = client.user.me()
        print("🔑 Reddit API client initialized successfully")
        return client
        
    except Exception as e:
        raise RuntimeError(f"❌ Failed to initialize Reddit client: {e}")

def is_post_recent(created_utc: float) -> bool:
    """Check if a post is within our lookback window"""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=config.LOOKBACK_HOURS)
    post_time = datetime.fromtimestamp(created_utc, tz=timezone.utc)
    return post_time >= cutoff

def scrape_raw_mentions(progress_callback: Optional[Callable[[str], None]] = None) -> pd.DataFrame:
    """
    Scrape raw mention data from Reddit.
    Returns DataFrame with one row per (post_id, ticker) combination.
    """
    def log_progress(message: str):
        if progress_callback:
            progress_callback(message)
        elif config.VERBOSE_LOGGING:
            print(message)
    
    log_progress("🚀 Starting Reddit scrape...")
    start_time = time.time()
    
    # Initialize Reddit client
    try:
        reddit = get_reddit_client()
    except RuntimeError as e:
        log_progress(str(e))
        return pd.DataFrame()
    
    # Initialize sentiment analyzer
    analyzer = SentimentIntensityAnalyzer()
    
    # Collect all mentions
    all_mentions = []
    total_posts_processed = 0
    total_mentions_found = 0
    
    for i, subreddit_name in enumerate(config.SUBREDDITS, 1):
        sub_start_time = time.time()
        posts_processed = 0
        mentions_found = 0
        
        try:
            log_progress(f"📡 [{i}/{len(config.SUBREDDITS)}] Scraping r/{subreddit_name}...")
            
            subreddit = reddit.subreddit(subreddit_name)
            
            for post in subreddit.new(limit=config.POST_LIMIT):
                posts_processed += 1
                total_posts_processed += 1
                
                # Progress updates
                if posts_processed % 100 == 0:
                    elapsed = time.time() - sub_start_time
                    rate = posts_processed / elapsed if elapsed > 0 else 0
                    log_progress(f"   → {posts_processed}/{config.POST_LIMIT} posts ({rate:.1f}/sec)")
                
                # Skip crossposts to avoid duplicates
                if getattr(post, "crosspost_parent", None):
                    continue
                
                # Skip posts we've already seen
                post_id = post.id
                if post_id in SEEN_POST_IDS:
                    continue
                SEEN_POST_IDS.add(post_id)
                
                # Skip old posts
                if not is_post_recent(post.created_utc):
                    continue
                
                # Extract text content
                title = getattr(post, 'title', '') or ''
                selftext = getattr(post, 'selftext', '') or ''
                text_content = f"{title}\n{selftext}".strip()
                
                # Find tickers in the text
                tickers = extract_tickers(text_content)
                if not tickers:
                    continue
                
                # Analyze sentiment
                try:
                    sentiment_scores = analyzer.polarity_scores(text_content)
                    compound_sentiment = sentiment_scores['compound']
                except Exception:
                    compound_sentiment = 0.0
                
                # Create mention records
                for ticker in tickers:
                    all_mentions.append({
                        'post_id': post_id,
                        'created_utc': int(post.created_utc),
                        'subreddit': subreddit_name.lower(),
                        'ticker': ticker,
                        'title': title,
                        'permalink': f"https://www.reddit.com{post.permalink}",
                        'score': getattr(post, 'score', 0),
                        'num_comments': getattr(post, 'num_comments', 0),
                        'sentiment': compound_sentiment
                    })
                    mentions_found += 1
                    total_mentions_found += 1
            
            # Subreddit summary
            sub_elapsed = time.time() - sub_start_time
            log_progress(f"✅ r/{subreddit_name}: {posts_processed} posts → {mentions_found} mentions ({sub_elapsed:.1f}s)")
            
        except Exception as e:
            log_progress(f"❌ Error scraping r/{subreddit_name}: {e}")
            continue
    
    # Create DataFrame
    if not all_mentions:
        log_progress("⚠️ No mentions found")
        return pd.DataFrame(columns=['post_id', 'created_utc', 'subreddit', 'ticker', 'title', 'permalink', 'score', 'num_comments', 'sentiment'])
    
    df = pd.DataFrame(all_mentions)
    
    # Remove exact duplicates
    original_count = len(df)
    df = df.drop_duplicates(subset=['post_id', 'ticker'], keep='first').reset_index(drop=True)
    dedup_count = original_count - len(df)
    
    # Final summary
    total_elapsed = time.time() - start_time
    log_progress(f"🎯 Scrape complete: {total_posts_processed} posts → {total_mentions_found} mentions → {len(df)} unique")
    if dedup_count > 0:
        log_progress(f"   Removed {dedup_count} duplicate (post_id, ticker) pairs")
    log_progress(f"   Total time: {total_elapsed:.1f}s")
    
    return df

def aggregate_mentions(raw_df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate raw mentions by ticker.
    Returns summary with mentions count, sentiment, sample posts, etc.
    """
    if raw_df.empty:
        print("📭 No data to aggregate")
        return pd.DataFrame(columns=['ticker', 'mentions', 'avg_sentiment', 'sample_title', 'sample_permalink', 'last_seen_utc'])
    
    print("🔄 Aggregating mentions by ticker...")
    
    # Ensure numeric sentiment
    raw_df['sentiment'] = pd.to_numeric(raw_df['sentiment'], errors='coerce')
    
    # Rank posts by score for sampling
    raw_df['score_rank'] = raw_df.groupby('ticker')['score'].rank(method='first', ascending=False)
    
    # Aggregate by ticker
    aggregated = raw_df.groupby('ticker').agg({
        'post_id': 'nunique',  # Count unique posts mentioning this ticker
        'sentiment': 'mean',   # Average sentiment
        'created_utc': 'max',  # Most recent mention timestamp
        'title': 'first',     # Sample title (will be replaced with highest scored)
        'permalink': 'first', # Sample permalink (will be replaced with highest scored)
        'score': 'max',       # Highest score
        'subreddit': lambda x: ', '.join(sorted(set(x)))  # List of subreddits
    }).reset_index()
    
    # Rename columns for clarity
    aggregated.rename(columns={
        'post_id': 'mentions',
        'sentiment': 'avg_sentiment',
        'created_utc': 'last_seen_utc'
    }, inplace=True)
    
    # Get the highest-scored post's title and permalink for each ticker
    top_posts = raw_df.loc[raw_df['score_rank'] == 1, ['ticker', 'title', 'permalink']].drop_duplicates('ticker')
    top_posts_dict = top_posts.set_index('ticker').to_dict('index')
    
    for idx, row in aggregated.iterrows():
        ticker = row['ticker']
        if ticker in top_posts_dict:
            aggregated.at[idx, 'sample_title'] = top_posts_dict[ticker]['title']
            aggregated.at[idx, 'sample_permalink'] = top_posts_dict[ticker]['permalink']
    
    # Filter by minimum mentions threshold
    aggregated = aggregated[aggregated['mentions'] >= config.MIN_MENTIONS_THRESHOLD]
    
    # Sort by mentions (descending), then by recency
    aggregated = aggregated.sort_values(['mentions', 'last_seen_utc'], ascending=[False, False]).reset_index(drop=True)
    
    print(f"📊 Aggregated {len(aggregated)} tickers (filtered by min {config.MIN_MENTIONS_THRESHOLD} mentions)")
    return aggregated

def scrape_and_analyze(progress_callback: Optional[Callable[[str], None]] = None) -> pd.DataFrame:
    """
    Main function to scrape Reddit and perform historical analysis.
    Returns DataFrame with current mentions plus percentage increase calculations.
    """
    def log_progress(message: str):
        if progress_callback:
            progress_callback(message)
        elif config.VERBOSE_LOGGING:
            print(message)
    
    # Clear seen posts for fresh scrape
    global SEEN_POST_IDS
    SEEN_POST_IDS.clear()
    
    log_progress("🎬 Starting comprehensive scrape and analysis...")
    overall_start = time.time()
    
    # Step 1: Scrape raw mentions
    raw_mentions = scrape_raw_mentions(progress_callback)
    if raw_mentions.empty:
        log_progress("❌ No data scraped - aborting analysis")
        return pd.DataFrame()
    
    # Step 2: Aggregate by ticker
    log_progress("📊 Aggregating mentions by ticker...")
    summary = aggregate_mentions(raw_mentions)
    if summary.empty:
        log_progress("❌ No tickers met minimum mention threshold")
        return pd.DataFrame()
    
    # Step 3: Add historical analysis (percentage increases)
    log_progress("📈 Calculating percentage increases vs historical baseline...")
    summary_with_analysis = add_percentage_increases(summary)
    
    # Step 4: Save data for future analysis
    log_progress("💾 Saving data...")
    
    # Save raw mentions for detailed history
    save_raw_mentions(raw_mentions)
    
    # Save daily summary for trend analysis
    save_daily_summary(summary_with_analysis)
    
    # Save current results
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    timestamped_file = config.DATA_DIR / f"summary_{timestamp}.csv"
    summary_with_analysis.to_csv(timestamped_file, index=False)
    summary_with_analysis.to_csv(config.LATEST_SUMMARY_CSV, index=False)
    
    log_progress(f"💾 Results saved: {timestamped_file}")
    
    # Step 5: Cleanup old files
    cleanup_old_files()
    
    # Final summary
    total_time = time.time() - overall_start
    log_progress(f"🏁 Analysis complete in {total_time:.1f}s")
    log_progress(f"📊 Found {len(summary_with_analysis)} trending tickers")
    
    if not summary_with_analysis.empty:
        # Show top results
        top_by_mentions = summary_with_analysis.iloc[0]
        log_progress(f"🏆 Top by mentions: {top_by_mentions['ticker']} ({top_by_mentions['mentions']} mentions)")
        
        if 'pct_increase' in summary_with_analysis.columns:
            top_by_increase = summary_with_analysis.loc[summary_with_analysis['pct_increase'].idxmax()]
            if top_by_increase['pct_increase'] > 0:
                log_progress(f"🚀 Biggest surge: {top_by_increase['ticker']} (+{top_by_increase['pct_increase']:.1f}%)")
    
    return summary_with_analysis

# Legacy function name for backwards compatibility
def scrape_mentions(progress_callback: Optional[Callable[[str], None]] = None) -> pd.DataFrame:
    """
    Legacy function name - calls scrape_and_analyze.
    Maintained for backwards compatibility with existing dashboard code.
    """
    return scrape_and_analyze(progress_callback)

if __name__ == "__main__":
    print("="*60)
    print("🔍 Reddit Hype Tracker - Standalone Test")
    print("="*60)
    
    # Run the scraper
    results = scrape_and_analyze()
    
    if not results.empty:
        print("\n" + "="*60)
        print("📊 TOP 15 RESULTS")
        print("="*60)
        
        display_cols = ['ticker', 'mentions', 'avg_sentiment', 'pct_increase', 'trend_direction']
        available_cols = [col for col in display_cols if col in results.columns]
        
        print(results[available_cols].head(15).to_string(index=False))
        
        # Show some insights
        if 'pct_increase' in results.columns:
            significant = results[results['pct_increase'] >= config.SIGNIFICANT_INCREASE_THRESHOLD]
            if not significant.empty:
                print(f"\n🚀 {len(significant)} tickers with significant increases (>{config.SIGNIFICANT_INCREASE_THRESHOLD}%):")
                for _, row in significant.head(5).iterrows():
                    print(f"   {row['ticker']}: {row['mentions']} mentions (+{row['pct_increase']:.1f}%)")
    else:
        print("❌ No results found. Check your Reddit API credentials and internet connection.")
    
    print("\n" + "="*60)
