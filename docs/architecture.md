# Architecture Overview

```mermaid
graph TD
    A[AI Agent<br/>Claude ChatGPT Perplexity etc]
    B[MCP Server]
    C[Salesforce CRM]
    D[External Tools APIs]
    E[LinkedIn Professional Networks]
    
    A <--> B
    B <--> C
    A --> D
    B --> E
