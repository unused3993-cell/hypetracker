import streamlit as st
import pandas as pd
import time
from datetime import datetime, timedelta
from typing import Dict, Any

import config
from scraper import scrape_and_analyze
from history_utils import get_trending_analysis, get_historical_chart_data

# Ensure data directory exists
config.DATA_DIR.mkdir(exist_ok=True)

# Page configuration
st.set_page_config(
    page_title="Reddit Hype Tracker", 
    layout="wide",
    page_icon="📈"
)

# Custom CSS for better styling
st.markdown("""
<style>
.metric-card {
    background-color: #f8f9fa;
    padding: 1rem;
    border-radius: 8px;
    border-left: 4px solid #007bff;
    margin: 0.5rem 0;
}
.surge-card {
    background: linear-gradient(90deg, #ff6b6b, #ee5a24);
    color: white;
    padding: 1rem;
    border-radius: 8px;
    margin: 0.5rem 0;
}
.gain-positive { color: #28a745; font-weight: bold; }
.gain-negative { color: #dc3545; font-weight: bold; }
.gain-neutral { color: #6c757d; }
.ticker-symbol { 
    font-family: 'Courier New', monospace; 
    font-weight: bold; 
    background-color: #e9ecef;
    padding: 2px 6px;
    border-radius: 4px;
}
</style>
""", unsafe_allow_html=True)

# Header
st.title("📈 Reddit Hype Tracker")
st.markdown("**Real-time stock ticker mentions with daily trend analysis**")
st.caption("Tracks percentage changes in Reddit chatter to identify trending stocks before they explode")

# Initialize session state
if 'last_scrape_time' not in st.session_state:
    st.session_state.last_scrape_time = None
if 'summary_data' not in st.session_state:
    st.session_state.summary_data = pd.DataFrame()

# Sidebar controls
with st.sidebar:
    st.header("🎛️ Controls")
    
    # Scraping section
    st.subheader("🔄 Data Source")
    
    # Show last scrape time if available
    if st.session_state.last_scrape_time:
        time_since = datetime.now() - st.session_state.last_scrape_time
        if time_since.total_seconds() < 3600:  # Less than 1 hour
            time_str = f"{int(time_since.total_seconds() / 60)} minutes ago"
        else:
            time_str = f"{int(time_since.total_seconds() / 3600)} hours ago"
        st.caption(f"Last scraped: {time_str}")
    
    # Scrape button
    if st.button("🔄 Run Fresh Scrape", type="primary", help="Scrape Reddit for new data and update trends"):
        # Progress containers
        progress_container = st.empty()
        status_container = st.empty()
        
        def update_progress(message: str):
            status_container.info(message)
        
        # Run the scrape
        with st.spinner("🕸️ Scraping Reddit and analyzing trends..."):
            try:
                results = scrape_and_analyze(progress_callback=update_progress)
                st.session_state.summary_data = results
                st.session_state.last_scrape_time = datetime.now()
                
                # Clear progress displays
                status_container.empty()
                progress_container.empty()
                
                if not results.empty:
                    st.success(f"✅ Found {len(results)} trending tickers!")
                else:
                    st.warning("⚠️ No trending tickers found")
                    
                st.rerun()
                
            except Exception as e:
                status_container.empty()
                progress_container.empty()
                st.error(f"❌ Scrape failed: {str(e)}")
                st.info("💡 Check your Reddit API credentials and internet connection")
    
    st.divider()
    
    # Filtering section
    st.subheader("🔍 Filters")
    
    min_mentions = st.slider(
        "Minimum mentions", 
        min_value=1, 
        max_value=50, 
        value=config.DEFAULT_MIN_MENTIONS,
        help="Filter out tickers with too few mentions"
    )
    
    # Sentiment filter
    col1, col2 = st.columns(2)
    with col1:
        min_sentiment = st.number_input(
            "Min sentiment", 
            value=-1.0, 
            min_value=-1.0, 
            max_value=1.0, 
            step=0.1,
            format="%.1f"
        )
    with col2:
        max_sentiment = st.number_input(
            "Max sentiment", 
            value=1.0, 
            min_value=-1.0, 
            max_value=1.0, 
            step=0.1,
            format="%.1f"
        )
    
    # Percentage increase filter
    min_increase = st.slider(
        "Min % increase",
        min_value=-100,
        max_value=500,
        value=0,
        step=10,
        help="Filter by percentage increase in mentions vs historical baseline"
    )
    
    # Ticker search
    include_tickers = st.text_input(
        "Include specific tickers",
        placeholder="TSLA,NVDA,GME",
        help="Comma-separated list of tickers to focus on"
    ).strip().upper()
    
    exclude_tickers = st.text_input(
        "Exclude tickers",
        placeholder="SPY,QQQ,AAPL",
        help="Comma-separated list of tickers to exclude"
    ).strip().upper()
    
    st.divider()
    
    # Quick filter presets
    st.subheader("⚡ Quick Filters")
    
    col1, col2 = st.columns(2)
    with col1:
        if st.button("🚀 Surging", help="Show only tickers with >100% increase"):
            st.session_state.min_increase_filter = 100
            st.rerun()
        
        if st.button("📈 Rising", help="Show bullish sentiment only"):
            st.session_state.sentiment_filter = "bullish"
            st.rerun()
    
    with col2:
        if st.button("🔥 Hot", help="Show high activity (10+ mentions)"):
            st.session_state.mentions_filter = 10
            st.rerun()
        
        if st.button("🆕 New", help="Show first-time mentions"):
            st.session_state.new_only_filter = True
            st.rerun()

# Load data
try:
    # Load from session state first, then fallback to file
    if not st.session_state.summary_data.empty:
        summary = st.session_state.summary_data.copy()
    else:
        summary = pd.read_csv(config.LATEST_SUMMARY_CSV)
        st.session_state.summary_data = summary
except FileNotFoundError:
    st.warning("📭 No data available yet. Click **🔄 Run Fresh Scrape** to get started!")
    st.markdown("""
    ### Quick Start Guide:
    1. **Set up Reddit API credentials** (see sidebar for defaults)
    2. **Run your first scrape** to collect baseline data
    3. **Use filters** to find interesting patterns
    4. **Run daily scrapes** to track percentage changes in chatter
    
    💡 The real insight is in the **% increase** column - it shows which stocks are gaining momentum!
    """)
    st.stop()

if summary.empty:
    st.warning("📭 No trending tickers found in latest scrape.")
    st.stop()

# Apply filters
original_count = len(summary)

# Mentions filter
summary = summary[summary['mentions'] >= min_mentions]

# Sentiment filter
summary = summary[
    (summary['avg_sentiment'].fillna(0.0) >= min_sentiment) &
    (summary['avg_sentiment'].fillna(0.0) <= max_sentiment)
]

# Percentage increase filter
if 'pct_increase' in summary.columns:
    summary = summary[summary['pct_increase'] >= min_increase]

# Include/exclude tickers
if include_tickers:
    include_list = {t.strip() for t in include_tickers.split(",") if t.strip()}
    summary = summary[summary['ticker'].isin(include_list)]

if exclude_tickers:
    exclude_list = {t.strip() for t in exclude_tickers.split(",") if t.strip()}
    summary = summary[~summary['ticker'].isin(exclude_list)]

filtered_count = len(summary)

# Main dashboard content
st.markdown("---")

# Top metrics row
col1, col2, col3, col4 = st.columns(4)

with col1:
    st.metric("📊 Tickers Found", original_count)

with col2:
    delta_count = filtered_count - original_count
    st.metric("✅ After Filters", filtered_count, delta=delta_count)

with col3:
    if not summary.empty and 'pct_increase' in summary.columns:
        avg_increase = summary['pct_increase'].mean()
        emoji = "🚀" if avg_increase >= 50 else "📈" if avg_increase >= 0 else "📉"
        st.metric("📈 Avg % Increase", f"{avg_increase:.1f}% {emoji}")
    else:
        st.metric("📈 Avg % Increase", "N/A")

with col4:
    if not summary.empty and 'pct_increase' in summary.columns:
        significant_count = len(summary[summary['pct_increase'] >= config.SIGNIFICANT_INCREASE_THRESHOLD])
        st.metric("🔥 Significant Surges", significant_count)
    else:
        st.metric("🔥 Significant Surges", "N/A")

# Trending analysis summary
try:
    trend_analysis = get_trending_analysis()
    if 'error' not in trend_analysis:
        st.markdown(f"""
        <div class="metric-card">
        <strong>📊 Daily Analysis</strong><br>
        • Total tickers tracked: <strong>{trend_analysis.get('total_tickers_tracked', 0)}</strong><br>
        • New tickers today: <strong>{trend_analysis.get('new_tickers_today', 0)}</strong><br>
        • Average increase: <strong>{trend_analysis.get('avg_increase', 0):.1f}%</strong><br>
        • Significant increases: <strong>{trend_analysis.get('significant_increases', 0)}</strong>
        </div>
        """, unsafe_allow_html=True)
except Exception:
    pass

st.markdown("---")

# Main data table
left_col, right_col = st.columns([3, 1])

with left_col:
    st.subheader("🎯 Trending Tickers")
    
    # Sorting controls
    sort_col1, sort_col2 = st.columns([2, 1])
    
    with sort_col1:
        sort_options = ['mentions', 'avg_sentiment']
        if 'pct_increase' in summary.columns:
            sort_options.insert(0, 'pct_increase')
        
        sort_by = st.selectbox("Sort by", sort_options, index=0)
    
    with sort_col2:
        ascending = st.checkbox("Ascending order", value=False)
    
    # Sort the data
    if sort_by in summary.columns:
        display_data = summary.sort_values(by=sort_by, ascending=ascending).reset_index(drop=True)
    else:
        display_data = summary.copy()
    
    # Prepare columns for display
    display_cols = ['ticker', 'mentions', 'avg_sentiment']
    
    if 'pct_increase' in display_data.columns:
        display_cols.append('pct_increase')
    
    if 'trend_direction' in display_data.columns:
        display_cols.append('trend_direction')
    
    # Format the data for better display
    display_df = display_data[display_cols].copy()
    
    if 'avg_sentiment' in display_df.columns:
        display_df['avg_sentiment'] = display_df['avg_sentiment'].round(3)
    
    # Style the dataframe
    def style_pct_increase(val):
        try:
            if pd.isna(val):
                return ''
            if val >= 100:
                return 'background-color: #d4edda; color: #155724; font-weight: bold'
            elif val >= 20:
                return 'background-color: #fff3cd; color: #856404; font-weight: bold'
            elif val >= 0:
                return 'color: #28a745'
            else:
                return 'color: #dc3545'
        except:
            return ''
    
    def style_sentiment(val):
        try:
            if pd.isna(val):
                return ''
            if val > 0.1:
                return 'color: #28a745'
            elif val < -0.1:
                return 'color: #dc3545'
            else:
                return 'color: #6c757d'
        except:
            return ''
    
    if not display_df.empty:
        styled_df = display_df.style
        
        if 'pct_increase' in display_df.columns:
            styled_df = styled_df.applymap(style_pct_increase, subset=['pct_increase'])
        
        if 'avg_sentiment' in display_df.columns:
            styled_df = styled_df.applymap(style_sentiment, subset=['avg_sentiment'])
        
        st.dataframe(styled_df, use_container_width=True, hide_index=True)
    else:
        st.info("🔍 No tickers match your current filters")

with right_col:
    st.subheader("📊 Quick Stats")
    
    if not summary.empty:
        # Sentiment breakdown
        if 'avg_sentiment' in summary.columns:
            bullish = len(summary[summary['avg_sentiment'] > 0.1])
            bearish = len(summary[summary['avg_sentiment'] < -0.1])
            neutral = len(summary) - bullish - bearish
            
            st.markdown(f"""
            **Sentiment Split:**
            - 🟢 Bullish: {bullish}
            - 🔴 Bearish: {bearish}  
            - 🟡 Neutral: {neutral}
            """)
        
        # Top mentions
        if 'mentions' in summary.columns:
            top_ticker = summary.loc[summary['mentions'].idxmax()]
            st.markdown(f"""
            **Most Discussed:**
            <div class="ticker-symbol">{top_ticker['ticker']}</div>
            {top_ticker['mentions']} mentions
            """, unsafe_allow_html=True)
        
        # Biggest gainer
        if 'pct_increase' in summary.columns and summary['pct_increase'].max() > 0:
            top_gainer = summary.loc[summary['pct_increase'].idxmax()]
            st.markdown(f"""
            **Biggest Surge:**
            <div class="ticker-symbol">{top_gainer['ticker']}</div>
            +{top_gainer['pct_increase']:.1f}% vs baseline
            """, unsafe_allow_html=True)

st.markdown("---")

# Detailed ticker analysis
st.subheader("🔬 Ticker Deep Dive")

if not summary.empty:
    col1, col2, col3 = st.columns([2, 2, 2])
    
    with col1:
        selected_ticker = st.selectbox(
            "Select ticker for detailed analysis",
            options=[""] + sorted(summary['ticker'].unique()),
            format_func=lambda x: "Choose a ticker..." if x == "" else x
        )
    
    if selected_ticker:
        ticker_data = summary[summary['ticker'] == selected_ticker].iloc[0]
        
        with col2:
            mentions = int(ticker_data['mentions'])
            sentiment = float(ticker_data['avg_sentiment'])
            sentiment_emoji = "🟢" if sentiment > 0.1 else "🔴" if sentiment < -0.1 else "🟡"
            
            st.metric("Mentions", mentions)
            st.metric("Sentiment", f"{sentiment:.3f} {sentiment_emoji}")
        
        with col3:
            if 'pct_increase' in ticker_data:
                pct_inc = float(ticker_data['pct_increase'])
                trend_emoji = "🚀" if pct_inc >= 100 else "📈" if pct_inc >= 20 else "➡️" if pct_inc >= -20 else "📉"
                st.metric("% Increase", f"{pct_inc:.1f}% {trend_emoji}")
            
            if 'last_seen_utc' in ticker_data:
                try:
                    last_seen = datetime.fromtimestamp(ticker_data['last_seen_utc'])
                    time_ago = datetime.now() - last_seen
                    if time_ago.total_seconds() < 3600:
                        time_str = f"{int(time_ago.total_seconds() / 60)}m ago"
                    else:
                        time_str = f"{int(time_ago.total_seconds() / 3600)}h ago"
                    st.metric("Latest Post", time_str)
                except:
                    st.metric("Latest Post", "Unknown")
        
        # Sample post
        if 'sample_title' in ticker_data and pd.notna(ticker_data['sample_title']):
            st.markdown("**Sample Post:**")
            st.markdown(f"*{ticker_data['sample_title']}*")
            
            if 'sample_permalink' in ticker_data and pd.notna(ticker_data['sample_permalink']):
                st.markdown(f"[🔗 View on Reddit]({ticker_data['sample_permalink']})")
        
        # Historical chart data (if available)
        try:
            chart_data = get_historical_chart_data(selected_ticker, days=14)
            if chart_data:
                st.markdown("**14-Day Mention History:**")
                chart_df = pd.DataFrame(chart_data)
                chart_df['date'] = pd.to_datetime(chart_df['date'])
                st.line_chart(chart_df.set_index('date')['mentions'])
        except Exception:
            pass

# Export section
st.markdown("---")
col1, col2, col3 = st.columns(3)

with col1:
    if not summary.empty:
        csv_data = summary.to_csv(index=False)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M")
        st.download_button(
            label="📥 Download CSV",
            data=csv_data,
            file_name=f"reddit_hype_tracker_{timestamp}.csv",
            mime="text/csv",
            help="Download current results as CSV file"
        )

with col2:
    # Show data info
    if config.DATA_DIR.exists():
        file_count = len(list(config.DATA_DIR.glob("summary_*.csv")))
        st.caption(f"📚 {file_count} historical snapshots saved")

with col3:
    if st.button("🗑️ Clear Session"):
        st.session_state.summary_data = pd.DataFrame()
        st.session_state.last_scrape_time = None
        st.success("Session cleared!")
        st.rerun()

# Footer
st.markdown("---")
st.markdown("""
<div style='text-align: center; color: #6c757d; font-size: 0.8em;'>
📈 Reddit Hype Tracker v2.0 • Built with Streamlit • Data from Reddit API • Sentiment via VADER<br>
💡 <strong>Key Insight:</strong> Focus on the "% Increase" column - it shows which stocks are gaining momentum vs their historical baseline
</div>
""", unsafe_allow_html=True)
