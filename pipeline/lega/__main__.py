"""Run the whole pipeline: python -m lega  (cached downloads make re-runs offline-safe)."""
from . import community, forecast, kulai, kulai_orientation, live, planner, simulate, streetlights, townships

if __name__ == "__main__":
    print("1/6 yield simulation"); simulate.run()
    print("2/6 township scans (building footprints)"); townships.run()
    print("3/6 community plan (facilities, solar street lamps)"); community.run()
    print("4/6 Kulai orientation study + sample layout"); kulai_orientation.run(); kulai.run()
    print("    planner load profiles + wettest week"); planner.run()
    print("5/6 forecast model + backtest"); forecast.run()
    print("6/6 live 14-day forecast"); live.run()
    print("+ street-light watch sample fleet"); streetlights.run()
