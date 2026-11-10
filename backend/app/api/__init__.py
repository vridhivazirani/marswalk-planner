"""HTTP API layer (FastAPI routers).

Rule: this is the *only* package allowed to import FastAPI routing objects.
Domain packages (geospatial, terrain, hazards, ...) must never import ``app.api``.
"""
