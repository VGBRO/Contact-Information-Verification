# AI Agent + Salesforce MCP Server: AI-Powered Contact Verification Demo

> **A PUBLIC DEMO showcasing how ANY AI Agent can read, verify, and update Salesforce contact data in real-time using the Model Context Protocol (MCP)**
> This example demonstrates the integration using Claude.

## 🎯 What This Demo Shows

This project demonstrates how **Claude can act as an autonomous agent** to:
- **Connect to Salesforce** through a custom MCP server
- **Read contact data** from your Salesforce org
- **Verify contacts** by searching LinkedIn and professional networks  
- **Update Salesforce records** with verification results
- **Make intelligent decisions** about data quality and accuracy

**This is more than just a script** – it's Claude acting as your intelligent CRM assistant!

## 🚀 Why This Matters

Traditional CRM tools require manual data entry and verification. This demo shows how **Claude can become your data quality agent**, automatically:

- **Understanding context** about your contacts
- **Making intelligent searches** across multiple platforms
- **Reasoning about data quality** and matching accuracy
- **Taking actions** to keep your CRM fresh and accurate

## 🔧 Architecture Overview

## Architecture
See our [Architecture Overview](docs/architecture.md) for system design details.

┌─────────────┐    MCP Protocol    ┌──────────────┐    Salesforce API    ┌─────────────┐
│ AI Agent    │◄──────────────────►│              │◄────────────────────►│             │
│ (Claude,    │                    │ MCP Server   │                      │ Salesforce  │
│ ChatGPT,    │                    │              │                      │    CRM      │
│ Perplexity, │                    │              │                      │             │
│ etc.)       │                    │              │                      │             │
└─────────────┘                    └──────────────┘                      └─────────────┘
       │                                  │
       │                                  │
       ▼                                  ▼
┌─────────────┐                    ┌──────────────┐
│  External   │                    │  LinkedIn &  │
│  Tools &    │◄───────────────────┤ Professional │
│  APIs       │                    │  Networks    │
└─────────────┘                    └──────────────┘

## ✨ Key Features

### 🤖 Claude as an Agent
- **Autonomous decision-making** about contact verification
- **Context-aware** reasoning about data quality
- **Natural language** interaction with your CRM data
- **Intelligent error handling** and retry logic

### 🔗 MCP Integration
- **Real-time bi-directional** communication with Salesforce
- **Secure authentication** through MCP protocol
- **Efficient data streaming** for large contact lists
- **Standardized tool interface** for extensibility

### 🎯 Smart Contact Verification
- **Multi-platform search** (LinkedIn, Duck Duck Go, Google, ZoomInfo, etc)
- **Intelligent matching** based on name, company, and role
- **Confidence scoring** for verification results
- **Automatic record updates** with audit trail

## 🛠️ Prerequisites

Before running this demo, you'll need:

- **Node.js 18+** installed
- **Claude Desktop** or API access
- **Salesforce org** (Developer Edition works great)
- **Basic command line** familiarity
- **30 minutes** for setup

## ⚡ Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/VGBRO/Contact-Information-Verification.git
cd Contact-Information-Verification
npm install
```

### 2. Configure Salesforce
```bash
# Copy configuration template
cp config.example.json config.json

# Edit with your Salesforce credentials
nano config.json
```

### 3. Set Up MCP Server
```bash
# Start the MCP server
npm run mcp-server

# Server will start on port 3000 by default
```

### 4. Connect Claude
Add this MCP server configuration to your Claude Desktop settings:

```json
{
  "mcpServers": {
    "salesforce-verifier": {
      "command": "node",
      "args": ["mcp-server.js"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

### 5. Start Chatting with Claude!
Open Claude Desktop and try:

> "Hey Claude, can you check my Salesforce contacts and verify the ones that haven't been updated in the last 6 months?"

## 💬 Example Claude Conversations

### Basic Contact Verification
```
You: "Claude, verify my top 10 contacts in Salesforce"

Claude: "I'll help you verify your Salesforce contacts! Let me connect to your org and check the contact data.

Found 247 total contacts. Here are the top 10 by recent activity that need verification:

1. John Smith (Microsoft) - Last verified: Never
2. Sarah Johnson (Google) - Last verified: 8 months ago
3. Mike Chen (Salesforce) - Last verified: 4 months ago

Starting verification process...

✅ John Smith: CONFIRMED - Found LinkedIn profile matching Microsoft role
❓ Sarah Johnson: OUTDATED - LinkedIn shows she's now at Meta, not Google  
✅ Mike Chen: CONFIRMED - Recent activity on LinkedIn confirms Salesforce role

Updated 3 records in Salesforce with verification results. Would you like me to continue with the remaining contacts?"
```

### Intelligent Data Analysis
```
You: "Which of my contacts have outdated job information?"

Claude: "I've analyzed your Salesforce contacts and cross-referenced with LinkedIn data. Here's what I found:

🔍 OUTDATED CONTACTS (7 found):
• Sarah Johnson: Salesforce shows 'Google' but LinkedIn shows 'Meta' (updated 3 months ago)
• David Wilson: Listed as 'Startup Founder' but company was acquired by IBM
• Lisa Chen: Title shows 'Manager' but LinkedIn indicates recent promotion to 'Director'

Would you like me to update these records automatically, or would you prefer to review each change first?"
```

## 🔧 Configuration

### Salesforce Setup
Create these custom fields on your Contact object:
- `Last_Verified__c` (Date)
- `Verification_Status__c` (Picklist: New, CONFIRMED, OUTDATED, UNKNOWN)
- `Verification_Notes__c` (Long Text Area)
- `Source_URL__c` (URL)

Run the automated setup:
```bash
npm run setup-fields
```

### MCP Server Configuration
Edit `mcp-config.json`:
```json
{
  "server": {
    "name": "salesforce-verifier",
    "version": "1.0.0",
    "port": 3000
  },
  "salesforce": {
    "instanceUrl": "https://yourorg.my.salesforce.com",
    "clientId": "your_connected_app_client_id",
    "clientSecret": "your_connected_app_client_secret"
  },
  "verification": {
    "batchSize": 10,
    "rateLimit": 2000,
    "confidenceThreshold": 0.8
  }
}
```

## 🎭 Available MCP Tools

Claude has access to these tools through the MCP server:

| Tool | Description | Example Usage |
|------|-------------|---------------|
| `get_contacts` | Retrieve contacts from Salesforce | Get all contacts modified in last month |
| `verify_contact` | Verify a single contact | Check if John Smith still works at Microsoft |
| `update_contact` | Update contact record | Mark contact as verified with new company info |
| `search_linkedin` | Search LinkedIn for contact | Find professional profile for Sarah Johnson |
| `bulk_verify` | Verify multiple contacts | Process 50 contacts in batch |
| `get_verification_stats` | Get verification statistics | Show summary of last verification run |

## 🔍 How It Works

1. **Claude connects** to the MCP server
2. **Requests contact data** from Salesforce
3. **Analyzes each contact** for verification needs
4. **Searches LinkedIn** and other professional networks
5. **Compares and matches** data intelligently
6. **Updates Salesforce records** with results
7. **Provides summary** and recommendations

## 🚀 Advanced Usage

### Batch Processing
```javascript
// Claude can process contacts in intelligent batches
await claude.tools.bulk_verify({
  criteria: "Last_Verified__c < LAST_N_MONTHS:6",
  batchSize: 25,
  priority: "high_value_contacts"
});
```

### Custom Verification Logic
```javascript
// Extend verification with custom business rules
await claude.tools.verify_contact({
  contactId: "003...",
  customRules: {
    requireActiveLinkedIn: true,
    checkCompanyChanges: true,
    validateEmailDomain: true
  }
});
```

## 🔐 Security & Privacy

- **Secure MCP protocol** for all communications
- **OAuth 2.0** authentication with Salesforce
- **No data storage** - all processing is real-time
- **Audit trails** for all record modifications
- **Rate limiting** to respect platform limits

## 🤝 Contributing

We welcome contributions to make this demo even better!

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

## 📚 Learn More

- **[Model Context Protocol Documentation](https://spec.modelcontextprotocol.io/)**
- **[Salesforce API Documentation](https://developer.salesforce.com/docs/apis)**
- **[Claude Desktop MCP Setup](https://docs.anthropic.com/mcp)**



## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋‍♀️ Support

- **📧 Issues**: [GitHub Issues](https://github.com/VGBRO/Contact-Information-Verification/issues)
- **💬 Discussions**: [GitHub Discussions](https://github.com/VGBRO/Contact-Information-Verification/discussions)
- **📖 Documentation**: Check our [Wiki](https://github.com/VGBRO/Contact-Information-Verification/wiki)

---

**Ready to see Claude transform your CRM workflow?** 🚀 

Start the demo and watch Claude become your intelligent data assistant!
