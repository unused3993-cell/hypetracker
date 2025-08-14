import os
from pathlib import Path

# Base Directory Configuration
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

# Reddit API Configuration
# For security, these should be set as environment variables
REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID", "-IEzlxhMSi9Sl5pWJG0fbw")
REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET", "k0lBJvnTHTMatv7MhnPYPvA6BoBoOQ")
REDDIT_USER_AGENT = os.getenv("REDDIT_USER_AGENT", "RedditHypeTracker/2.0")

# Scraping Configuration
POST_LIMIT = int(os.getenv("POST_LIMIT", "500"))  # Posts per subreddit per run
LOOKBACK_HOURS = int(os.getenv("LOOKBACK_HOURS", "48"))  # Only consider posts from last N hours
RATE_LIMIT_SECONDS = 1  # Delay between Reddit API calls

# Target Subreddits (ordered by priority - higher volume first)
SUBREDDITS = [
    # High volume stock discussions
    "wallstreetbets",
    "stocks", 
    "investing",
    "StockMarket",
    
    # Specialized stock discussions
    "SecurityAnalysis",
    "ValueInvesting",
    "pennystocks",
    "smallstreetbets", 
    "SPACs",
    "options",
    
    # Crypto (optional - can be disabled)
    "CryptoMarkets",
    "cryptocurrency", 
    "cryptostreetbets",
]

# File Paths
TICKERS_MASTER_CSV = DATA_DIR / "tickers_master.csv"
MENTIONS_HISTORY_CSV = DATA_DIR / "mentions_history.csv"
DAILY_SUMMARIES_CSV = DATA_DIR / "daily_summaries.csv"
LATEST_SUMMARY_CSV = DATA_DIR / "latest_summary.csv"

# Legacy file support
STOCK_TICKERS_FILE = DATA_DIR / "stock_tickers.csv"
CRYPTO_TICKERS_FILE = DATA_DIR / "crypto_tickers.csv"

# Ticker Filtering
EXCLUDE_USUAL_SUSPECTS = os.getenv("EXCLUDE_USUAL_SUSPECTS", "true").lower() == "true"
USUAL_SUSPECTS = {
    # Mega-cap stocks that dominate discussions
    "AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "GOOGL", "GOOG", "META", 
    "AMD", "NFLX", "INTC", "CRM", "ORCL", "ADBE",
    
    # Index funds and ETFs
    "QQQ", "SPY", "TQQQ", "SQQQ", "VTI", "VOO", "IWM", "DIA",
    "ARKK", "ARKW", "ARKG", "XLF", "XLE", "XLK", "SMH",
    
    # Common false positives
    "CEO", "CFO", "CTO", "IPO", "FDA", "SEC", "FED", "GDP", "CPI"
}

# Minimum requirements for ticker inclusion
MIN_TICKER_LENGTH = 1
MAX_TICKER_LENGTH = 5
MIN_MENTIONS_THRESHOLD = int(os.getenv("MIN_MENTIONS", "2"))

# Historical Analysis Configuration
BASELINE_DAYS = 7  # How many days to use for baseline calculation
MIN_BASELINE_MENTIONS = 1  # Minimum mentions needed in baseline period
SIGNIFICANT_INCREASE_THRESHOLD = 50.0  # % increase to flag as "significant"

# Sentiment Analysis
SENTIMENT_THRESHOLDS = {
    "VERY_BULLISH": 0.5,
    "BULLISH": 0.2, 
    "NEUTRAL_HIGH": 0.05,
    "NEUTRAL_LOW": -0.05,
    "BEARISH": -0.2,
    "VERY_BEARISH": -0.5
}

# Dashboard Configuration
DEFAULT_MIN_MENTIONS = 3
DEFAULT_SORT_FIELD = "pct_increase"  # Sort by % increase by default
MAX_DISPLAY_TICKERS = 100
CACHE_DURATION_MINUTES = 30

# Data Retention
MAX_DAILY_SUMMARIES_DAYS = 90  # Keep 3 months of daily summaries
MAX_RAW_FILES_DAYS = 7  # Keep 1 week of raw scrape files

# Performance and Debugging
DEBUG_MODE = os.getenv("DEBUG", "false").lower() == "true"
VERBOSE_LOGGING = DEBUG_MODE
ENABLE_PROGRESS_BARS = True

# Reddit Content Filtering
STOP_TOKENS = {
    # Time references
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
    "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN",
    
    # Common abbreviations
    "DD", "YOLO", "HODL", "FOMO", "ATH", "ATL", "LFG", "WSB",
    "GDP", "EPS", "P/E", "ROI", "YTD", "QOQ", "YOY",
    
    # Geographic/Currency
    "USD", "EUR", "GBP", "CAD", "JPY", "CNY",
    "US", "USA", "EU", "UK", "NYSE", "NASDAQ",
    
    # Tech/Business terms that aren't tickers
    "AI", "ML", "VR", "AR", "IOT", "API", "UI", "UX", 
    "PDF", "HTML", "CSS", "JS", "SQL", "AWS", "CEO", "CFO", "CTO",
    
    # Trading terms
    "OTC", "ETF", "REIT", "SPAC", "ESG", "DCA", "RSI", "MACD",
    
    # PROBLEM WORDS - Common English words that are also valid tickers
    "CAN", "ANY", "ALL", "NEW", "NOW", "ONE", "TWO", "FOR", "THE", "AND",
    "BUT", "NOT", "ARE", "YOU", "GET", "GOT", "PUT", "SEE", "SET", "RUN",
    "GOOD", "WELL", "BEST", "NICE", "PLAY", "TURN", "WISH", "HOPE", "WANT",
    "COST", "GAIN", "LOSS", "RISK", "CASH", "DEBT", "LOAN", "FUND", "BANK",
    "OPEN", "SHUT", "FULL", "HALF", "HIGH", "LONG", "FAST", "SLOW", "HUGE",
    "MAIN", "REAL", "TRUE", "SAFE", "SURE", "HARD", "EASY", "FREE", "RICH",
    
    # Reddit-specific terms
    "OP", "OG", "TL", "DR", "EDIT", "UPDATE", "THANKS", "PLEASE", "HELP",
    "POST", "COMMENT", "REPLY", "VOTE", "KARMA", "GOLD", "AWARD", "MOD",
    
    # Single letters (except known valid single-letter tickers)
    "I", "A", "TO", "OR", "SO", "GO", "UP", "IT", "IS", "ON", "IN", "AT", "OF", "BY",
    
    # Financial/Market terms that aren't specific tickers
    "BULL", "BEAR", "MOON", "MARS", "MOON", "SHIP", "RIDE", "TRIP", "MOVE",
    "BUY", "SELL", "HOLD", "KEEP", "TAKE", "MAKE", "SAVE", "EARN", "SPEND",
    
    # Time-related that could be confused
    "DAY", "WEEK", "YEAR", "TIME", "DATE", "HOUR", "SOON", "LATE", "EARLY"
}

# Single letter tickers that ARE actually valid (don't filter these)
SINGLE_LETTER_ALLOWED = {"F", "T", "C", "K", "B", "M", "X", "D"}  # Removed "A" since it causes issues

# Export settings
EXPORT_FORMATS = ["csv", "json"]
INCLUDE_SAMPLE_POSTS = True

print(f"✅ Configuration loaded - Data directory: {DATA_DIR}")
if DEBUG_MODE:
    print(f"🔧 Debug mode enabled")
if not REDDIT_CLIENT_ID or REDDIT_CLIENT_ID == "-IEzlxhMSi9Sl5pWJG0fbw":
    print("⚠️  Using default Reddit credentials - set environment variables for production")
