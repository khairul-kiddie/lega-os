"""Run the whole pipeline: python -m lega  (cached downloads make re-runs offline-safe)."""
from . import community, forecast, live, simulate, townships

if __name__ == "__main__":
    print("1/5 yield simulation"); simulate.run()
    print("2/5 township scans (building footprints)"); townships.run()
    print("3/5 community plan (facilities, street lamps, batteries)"); community.run()
    print("4/5 forecast model + backtest"); forecast.run()
    print("5/5 live 14-day forecast"); live.run()
