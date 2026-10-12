# Switch mappings are defined by the active profile in /profiles (see profiles/README.md)
from multimode.setup import create_engine
from display import UI

Inputs = create_engine(UI).inputs
