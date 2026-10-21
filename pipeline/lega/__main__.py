"""Run the whole pipeline: python -m lega  (cached downloads make re-runs offline-safe)."""
from . import forecast, live, roofs, simulate

if __name__ == "__main__":
    print("1/4 yield simulation"); simulate.run()
    print("2/4 roofs"); roofs.run()
    print("3/4 forecast model + backtest"); forecast.run()
    print("4/4 live 14-day forecast"); live.run()
