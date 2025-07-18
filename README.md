# Salesforce Contact Verification System

A powerful Node.js tool that automatically verifies your Salesforce contacts by searching LinkedIn and other professional networks. Keep your CRM data fresh and accurate with automated contact verification.

## 🌟 What This Does

- **Automatically verifies contacts** in your Salesforce org
- **Searches LinkedIn** and other professional networks to confirm contact information
- **Updates Salesforce records** with verification status and notes
- **Handles bulk verification** of hundreds of contacts
- **Respectful rate limiting** to avoid being blocked by search engines
- **Multiple search strategies** for better success rates

## 🚀 Features

- ✅ **Multi-engine search**: Uses Google, Bing, and DuckDuckGo for comprehensive results
- ✅ **Smart matching**: Compares names and companies to determine verification status
- ✅ **Salesforce integration**: Automatically updates custom fields with results
- ✅ **Batch processing**: Handles large contact lists efficiently
- ✅ **Error handling**: Robust error handling and retry logic
- ✅ **Detailed logging**: See exactly what's happening during verification
- ✅ **Configurable**: Easy to customize for your specific needs

## 📋 Prerequisites

Before you start, you'll need:
- A computer (Windows, Mac, or Linux)
- Basic familiarity with command line
- A Salesforce org (free Developer Edition works great)
- About 30 minutes for initial setup

## 🛠️ Installation

### Step 1: Install Node.js
Download and install Node.js from [nodejs.org](https://nodejs.org/). Choose the LTS version (recommended for most users).

### Step 2: Clone This Repository
```bash
git clone https://github.com/yourusername/salesforce-contact-verifier.git
cd salesforce-contact-verifier
```

### Step 3: Install Dependencies
```bash
npm install
```

### Step 4: Set Up Configuration
1. Copy the example configuration file:
   ```bash
   cp config.example.json config.json
   ```

2. Edit `config.json` with your Salesforce credentials (see Configuration section below)

## ⚙️ Configuration

### Salesforce Setup

1. **Create a Connected App** in Salesforce:
   - Go to Setup → App Manager → New Connected App
   - Name it "Contact Verifier"
   - Enable OAuth Settings
   - Callback URL: `http://localhost:3000/callback`
   - OAuth Scopes: Select "Full access" and "Perform requests at any time"

2. **Get your credentials**:
   - Consumer Key and Consumer Secret from your Connected App
   - Your Salesforce username and password
   - Your Salesforce instance URL (like `https://yourorg.my.salesforce.com`)

3. **Update config.json**:
   ```json
   {
     "salesforce": {
       "instanceUrl": "https://yourorg.my.salesforce.com",
       "clientId": "your_consumer_key_here",
       "clientSecret": "your_consumer_secret_here",
       "username": "your_salesforce_username",
       "password": "your_salesforce_password"
     }
   }
   ```

### Salesforce Custom Fields

The system requires these custom fields on the Contact object:

- **Last_Verified__c** (Date) - When the contact was last verified
- **Verification_Status__c** (Picklist) - Values: New, CONFIRMED, OUTDATED, UNKNOWN
- **Verification_Notes__c** (Long Text Area) - Details about the verification
- **Source_URL__c** (URL) - Link to the source where contact was found

Run the field setup script to create these automatically:
```bash
node setup-fields.js
```

## 🚀 Usage

### Basic Usage
Run the verification on all contacts that haven't been verified in the last 6 months:
```bash
node verify-contacts.js
```

### Advanced Usage
```bash
# Verify only specific contacts
node verify-contacts.js --limit 50

# Verify contacts from a specific time period
node verify-contacts.js --months 3

# Dry run (don't update Salesforce)
node verify-contacts.js --dry-run
```

### What You'll See
```
🚀 Starting Contact Verification System...
🔐 Connecting to Salesforce...
✅ Successfully connected to Salesforce!
📋 Getting contacts to verify...
📊 Found 25 contacts to verify

🔍 Verifying: John Smith (Microsoft)
🔍 Trying Google LinkedIn: https://www.google.com/search?q=...
📊 Google found 3 results
📊 Result: CONFIRMED - Contact verified via LinkedIn

💾 Updating Salesforce records...
✅ Updated contact with status: CONFIRMED

📊 VERIFICATION SUMMARY:
CONFIRMED: 15 contacts
OUTDATED: 5 contacts
UNKNOWN: 5 contacts

✅ Verification complete!
```

## 🔧 Customization

### Modify Search Strategies
Edit the `searchStrategies` array in `verify-contacts.js` to add new search engines or modify existing ones.

### Change Verification Logic
Update the `verifyContact` method to customize how contacts are matched and verified.

### Adjust Rate Limiting
Modify the delays between searches in the main verification loop.

## 🤝 Contributing

We welcome contributions! Here's how to help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: Report bugs or request features via [GitHub Issues](https://github.com/yourusername/salesforce-contact-verifier/issues)
- **Discussions**: Ask questions in [GitHub Discussions](https://github.com/yourusername/salesforce-contact-verifier/discussions)
- **Email**: Contact us at your-email@example.com

## ⚠️ Important Notes

- This tool respects rate limits and includes delays to avoid being blocked
- LinkedIn has anti-scraping measures; results may vary
- Always test with a small batch first
- Keep your Salesforce credentials secure

## 🙏 Acknowledgments

- Built with [JSForce](https://jsforce.github.io/) for Salesforce integration
- Uses [Puppeteer](https://pptr.dev/) for web automation
- Inspired by the need for accurate CRM data

## 📈 Roadmap

- [ ] Add support for more professional networks
- [ ] Implement machine learning for better matching
- [ ] Add web dashboard for monitoring
- [ ] Create Salesforce Lightning component
- [ ] Add support for bulk CSV imports

---

**Happy verifying!** 🎉 Keep your contacts fresh and your CRM accurate.
