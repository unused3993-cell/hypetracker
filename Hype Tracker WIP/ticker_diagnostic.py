#!/usr/bin/env python3
"""
Diagnostic script to check ticker validation and identify false positives.
Run this to see what's happening with your ticker detection.
"""

import pandas as pd
import re
from pathlib import Path

# Check if we can load the ticker master file
DATA_DIR = Path("data")
TICKERS_MASTER_CSV = DATA_DIR / "tickers_master.csv"

def load_and_analyze_tickers():
    """Load ticker master and analyze the problematic tickers"""
    
    print("🔍 TICKER VALIDATION DIAGNOSTIC")
    print("=" * 50)
    
    # Check if files exist
    files_to_check = [
        "tickers_master.csv",
        "nasdaq-listed.csv", 
        "nyse-listed.csv",
        "latest_summary.csv"
    ]
    
    for filename in files_to_check:
        filepath = DATA_DIR / filename
        if filepath.exists():
            print(f"✅ {filename} - EXISTS")
        else:
            print(f"❌ {filename} - MISSING")
    
    print("\n" + "=" * 50)
    
    # Load ticker master if it exists
    if TICKERS_MASTER_CSV.exists():
        try:
            df = pd.read_csv(TICKERS_MASTER_CSV)
            print(f"📊 Ticker Master File:")
            print(f"   Total tickers: {len(df)}")
            print(f"   Columns: {list(df.columns)}")
            print(f"   Sample tickers: {df.head()['symbol'].tolist() if 'symbol' in df.columns else 'No symbol column'}")
            
            # Check the problematic tickers
            problematic = ['CAN', 'ANY', 'OP', 'COST']
            
            symbol_col = None
            for col in ["symbol", "Symbol", "SYMBOL", "ticker", "Ticker"]:
                if col in df.columns:
                    symbol_col = col
                    break
            
            if symbol_col:
                print(f"\n🚨 CHECKING PROBLEMATIC TICKERS:")
                for ticker in problematic:
                    is_valid = ticker in df[symbol_col].values
                    status = "✅ VALID TICKER" if is_valid else "❌ FALSE POSITIVE"
                    print(f"   {ticker}: {status}")
                    
                    if is_valid:
                        ticker_info = df[df[symbol_col] == ticker]
                        if 'name' in df.columns:
                            name = ticker_info['name'].iloc[0] if not ticker_info.empty else "Unknown"
                            print(f"      Company: {name}")
            
        except Exception as e:
            print(f"❌ Error loading ticker master: {e}")
    
    # Load and analyze latest summary
    latest_summary_file = DATA_DIR / "latest_summary.csv"
    if latest_summary_file.exists():
        try:
            summary = pd.read_csv(latest_summary_file)
            print(f"\n📈 LATEST SUMMARY ANALYSIS:")
            print(f"   Total tickers found: {len(summary)}")
            print(f"   Top 5 by mentions:")
            
            for _, row in summary.head().iterrows():
                ticker = row['ticker']
                mentions = row['mentions'] 
                sentiment = row.get('avg_sentiment', 0)
                print(f"      {ticker}: {mentions} mentions (sentiment: {sentiment:.3f})")
                
                # Show sample title to check for false positives
                if 'sample_title' in row and pd.notna(row['sample_title']):
                    title = str(row['sample_title'])[:80] + "..." if len(str(row['sample_title'])) > 80 else str(row['sample_title'])
                    print(f"         Sample: \"{title}\"")
                
        except Exception as e:
            print(f"❌ Error loading latest summary: {e}")
    
    print("\n" + "=" * 50)
    print("🔧 RECOMMENDATIONS:")
    print("1. Check if CAN/ANY are being extracted from common words")
    print("2. Review sample titles above for context")
    print("3. Consider adding common false positives to STOP_TOKENS in config.py")
    print("4. Run the scraper with more restrictive filtering if needed")

if __name__ == "__main__":
    load_and_analyze_tickers()
