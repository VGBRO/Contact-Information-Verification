graph TD
    A["🤖 AI Agent<br/>(Claude, ChatGPT,<br/>Perplexity, etc.)"] 
    B["⚡ MCP Server"]
    C["🏢 Salesforce<br/>CRM"]
    D["🔧 External<br/>Tools & APIs"]
    E["💼 LinkedIn &<br/>Professional<br/>Networks"]
    
    A <-->|"MCP Protocol"| B
    B <-->|"Salesforce API"| C
    A --> D
    B --> E
    
    style A fill:#e1f5fe
    style B fill:#f3e5f5
    style C fill:#e8f5e8
    style D fill:#fff3e0
    style E fill:#fce4ec
