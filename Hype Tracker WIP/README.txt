
# Hype Tracker Dashboard (Streamlit)

## How to Run
1. Install dependencies:
   pip install streamlit praw pandas textblob

2. Run the app:
   streamlit run dashboard.py

## What It Does
- Scrapes Reddit for new mentions of small-cap stocks and cryptos
- Filters tickers below $2B market cap
- Scores based on mentions, votes, comments, and sentiment
