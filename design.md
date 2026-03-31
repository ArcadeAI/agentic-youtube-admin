This projects build an agent using Mastra (https://mastra.ai/docs) and Arcade.dev (https://docs.arcade.dev/en/home)

What the system does is help a social media manager keep tabs with:
- A company youtube channel
- Influencers that they have hired in the past
- Influencers that they may hire in the future

# Architecture of the system

This is a multi-user system implemented in Elysia, Bun and Prisma. The repository will also contain 2 python projects that implement Arcade MCP servers that will be deployed at arcade.dev to make the tools available for both the server and external MCP clients.

The deployment of this will be in render.com

The server is mostly meant to:

- manage the database, offering a CRUD layer and connecting the database to the Arcade tools defined on the python projects. The MCP tools will return untyped json, so a critical part of the server is to correctly handle all the mapping between the returned object and keeping the database consisten.
- The server will be in charge of running periodic "scans" of all the configured channels and videos at the configured frequency.
- The server will be in charge of notifying the user (it does so calling an Arcade tool)


The database design is detailed in the database.md file
Arcade tools for this project are detailed in tools-reference.md, and some are already implemented.
