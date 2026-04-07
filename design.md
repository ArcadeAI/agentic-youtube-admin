This projects build an agent using Mastra ([https://mastra.ai/docs](https://mastra.ai/docs)) and Arcade.dev ([https://docs.arcade.dev/en/home](https://docs.arcade.dev/en/home))

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
- The server will be in charge of notifying the user (it does so calling an Arcade tool to be implemented).

## Important design guidelines

The server should be modular and testable. Generally we have

- The YouTube module, offers the CRUD layer and handles calling the Arcade tools and saving the results to the database
- The Scheduler module, handles the CRUD and handlers to configure the scans and index operations
- The Library module. This relies on the arcade-library module to build an index grouped per-channel and per-video from all generated transcriptions.
- The Notification module, handles the CRUD and handlers to configure the notifications
- The Scanner module: the "glue" of the system, it runs the actual scans (through the YouTube module), and it respects the configuration set on the Scheduler module. Finally, it notifies the user based on what was configured on the Notification module
- The InteractiveSession module. This module is in charge of providing the data for the MCP server that exposes this app's functionality to users that interact with it through an MCP client.

## The app's MCP server

There are two ways in which Arcade MCP is involved in this server, for YouTube calls, this is handled by the youtube_tools server. However, there's a second MCP server that will be deployed to Arcade and that has an impact on the server module interfaces, specifically the InteractiveSession module.

Interactive sessions offer the ability to remotely control the server and perform:

- CRUD actions for notifications
- CRUD actions for scheduling
- Reporting

The interactive session module will expose the interface to the Scheduler and Notification modules CRUD endpoints in a way that's easy for an LLM to use. Interactive sessions are:

- stateless (the state of the conversation is managed by the agent holding the MCP client)
- Optimized for LLM usage, offering configurable APIs that can be directly mapped to the MCP tools that will be defined in the server.

### Reporting tools to implement

Most of these tools will mimic the interface of the ones implemented on youtube_tools, but instead of using the YouTube API, they will simply retrieve the data from this system.

- get_channel_analytics
- summarize_video (it uses the available transcript)
- search_in_channel (it uses the arcade-library to search and retrieve transcripts relevant to a query)

The MCP server tools will handle pagination (for relevant endpoints, the server should return a "next page token" for pagination)

## How transcriptions are handled

Transcriptions will not be stored in the database, as these are meant to be indexed by arcade-library. Instead, transcriptions should be written in a file structure like this:

transcriptions/
|-- channel_<id 1>/
|---- title-slug_<video id 1>.md
|---- title-slug_<video id 2>.md
|---- title-slug_<video id 3>.md
|-- channel_<id 2>/
|---- title-slug_<video id 1>.md
|---- title-slug_<video id 2>.md
|-- channel_<id 3>/
|---- title-slug_<video id 1>.md
|---- title-slug_<video id 2>.md
|---- title-slug_<video id 3>.md
|-- ...
|-- channel_/
|---- title-slug_<video id 1>.md
|---- title-slug_<video id 2>.md

the result of the `search_in_channel` tool must include the URL to one of these files in the response structure.

The tool may optionally return a summary of the transcription, generated with an LLM. This may be implemented with Mastra workflows ([https://mastra.ai/docs/workflows/overview](https://mastra.ai/docs/workflows/overview)) and workspaces ([https://mastra.ai/docs/workspace/overview](https://mastra.ai/docs/workspace/overview)), workspaces are optional, and we prefer the most deterministic option.

## How scans should be implemented

Most scans should rely on Mastra workflows: [https://mastra.ai/docs/workflows/overview](https://mastra.ai/docs/workflows/overview)

The reason for this is that most of the logic will "live" inside the MCP tools (by desing), and the
server is meant to be the orchestrator of the tools. 

Most scans will be 

# Other design

The database design is detailed in the database.md file
Arcade tools for this project are detailed in tools-reference.md, and some are already implemented.