import pandas as pd

nasdaq = pd.read_csv("data/nasdaq-listed.csv")
nyse = pd.read_csv("data/nyse-listed.csv")

print("NASDAQ columns:")
print(nasdaq.columns.tolist())

print("\nNYSE columns:")
print(nyse.columns.tolist())
