import csv
from pathlib import Path

# Path to the ticker CSV
DATA_DIR = Path(__file__).parent / "data"
TICKER_CSV = DATA_DIR / "tickers_master.csv"

def load_ticker_set():
    tickers = set()
    with open(TICKER_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            sym = row["symbol"].strip().upper()
            if 1 <= len(sym) <= 5 and sym.isalpha():
                if row.get("is_etf", "").lower() in ("true", "1", "yes"):
                    continue
                tickers.add(sym)
    print("Loaded tickers:", len(tickers))  # ✅ This is what we're testing
    return tickers

# Call the function
TICKER_SET = load_ticker_set()
