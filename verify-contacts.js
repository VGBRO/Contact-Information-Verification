const jsforce = require('jsforce');
const puppeteer = require('puppeteer');
const { program } = require('commander');
const colors = require('colors');
const ora = require('ora');
const fs = require('fs');
const path = require('path');

// Load configuration
let config;
try {
  config = require('./config.json');
} catch (error) {
  console.error('❌ Error loading config.json. Make sure you copied config.example.json to config.json and filled in your credentials.'.red);
  process.exit(1);
}

// Command line options
program
  .version('1.0.0')
  .option('-l, --limit <number>', 'limit number of contacts to verify', '10')
  .option('-m, --months <number>', 'verify contacts not checked in X months', '6')
  .option('-d, --dry-run', 'run without updating Salesforce')
  .option('-v, --verbose', 'verbose logging')
  .parse();

const options = program.opts();

class ContactVerifier {
  constructor() {
    this.conn = new jsforce.Connection({
      loginUrl: config.salesforce.instanceUrl
    });
    this.dryRun = options.dryRun;
    this.verbose = options.verbose;
  }

  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const colors_map = {
      info: 'cyan',
      success: 'green',
      warning: 'yellow',
      error: 'red'
    };
    
    if (this.verbose || type !== 'info') {
      console.log(`[${timestamp}] ${message}`[colors_map[type]]);
    }
  }

  async connectToSalesforce() {
    const spinner = ora('Connecting to Salesforce...').start();
    
    try {
      await this.conn.login(config.salesforce.username, config.salesforce.password);
      spinner.succeed('Successfully connected to Salesforce!');
      return true;
    } catch (error) {
      spinner.fail('Failed to connect to Salesforce');
      console.error('Error details:', error.message.red);
      return false;
    }
  }

  async getContactsToVerify() {
    const spinner = ora('Getting contacts to verify...').start();
    
    try {
      const query = `
        SELECT Id, Name, Account.Name, Title, Email, Last_Verified__c, Verification_Status__c
        FROM Contact 
        WHERE (Last_Verified__c < LAST_N_MONTHS:${options.months} OR Last_Verified__c = null)
        AND AccountId != null 
        AND Title != null
        AND Name != null
        ORDER BY LastModifiedDate DESC
        LIMIT ${options.limit}
      `;
      
      const result = await this.conn.query(query);
      spinner.succeed(`Found ${result.records.length} contacts to verify`);
      
      if (this.verbose) {
        result.records.forEach((contact, index) => {
          console.log(`${index + 1}. ${contact.Name} (${contact.Account?.Name || 'Unknown Company'})`.gray);
        });
      }
      
      return result.records;
    } catch (error) {
      spinner.fail('Error getting contacts');
      console.error('Error details:', error.message.red);
      return [];
    }
  }

  async searchLinkedIn(contactName, company) {
    const spinner = ora(`Searching for ${contactName} at ${company}...`).start();
    let browser;
    
    try {
      browser = await puppeteer.launch({ 
        headless: true,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-extensions',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ]
      });
      
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      });
      
      // Search strategies with fallbacks
      const searchStrategies = [
        {
          name: 'Google',
          url: `https://www.google.com/search?q=${encodeURIComponent(`"${contactName}" "${company}" site:linkedin.com/in`)}`,
          selector: 'a[href*="linkedin.com/in/"]'
        },
        {
          name: 'DuckDuckGo',
          url: `https://duckduckgo.com/?q=${encodeURIComponent(`${contactName} ${company} site:linkedin.com/in`)}`,
          selector: 'a[href*="linkedin.com/in/"]'
        },
        {
          name: 'Bing',
          url: `https://www.bing.com/search?q=${encodeURIComponent(`"${contactName}" "${company}" site:linkedin.com/in`)}`,
          selector: 'a[href*="linkedin.com/in/"]'
        }
      ];
      
      let results = [];
      
      for (const strategy of searchStrategies) {
        try {
          this.log(`Trying ${strategy.name}...`);
          
          // Random delay to appear more human
          await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
          
          await page.goto(strategy.url, { 
            waitUntil: 'networkidle2',
            timeout: 15000 
          });
          
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          results = await page.evaluate((selector) => {
            const linkedInLinks = document.querySelectorAll(selector);
            const foundResults = [];
            
            linkedInLinks.forEach(link => {
              if (link.href && link.href.includes('linkedin.com/in/')) {
                const parent = link.closest('.g') || 
                              link.closest('[data-ved]') || 
                              link.closest('.result') ||
                              link.closest('article') ||
                              link.closest('li') ||
                              link.closest('.b_algo') ||
                              link.parentElement;
                
                if (parent) {
                  const titleElement = parent.querySelector('h3') || 
                                    parent.querySelector('h2') || 
                                    parent.querySelector('.LC20lb') ||
                                    parent.querySelector('[data-testid="result-title-a"]');
                  
                  const snippetElement = parent.querySelector('.VwiC3b') || 
                                       parent.querySelector('.s') || 
                                       parent.querySelector('[data-testid="result-snippet"]') ||
                                       parent.querySelector('.b_caption') ||
                                       parent.querySelector('.result__snippet');
                  
                  foundResults.push({
                    title: titleElement ? titleElement.textContent.trim() : link.textContent.trim(),
                    url: link.href,
                    snippet: snippetElement ? snippetElement.textContent.trim() : ''
                  });
                }
              }
            });
            
            return foundResults.slice(0, 5);
          }, strategy.selector);
          
          if (results.length > 0) {
            spinner.succeed(`Found ${results.length} potential matches using ${strategy.name}`);
            break;
          }
          
        } catch (strategyError) {
          this.log(`${strategy.name} search failed: ${strategyError.message}`, 'warning');
          continue;
        }
      }
      
      if (results.length === 0) {
        spinner.warn(`No LinkedIn profiles found for ${contactName}`);
      }
      
      await browser.close();
      return results;
      
    } catch (error) {
      spinner.fail(`Search failed for ${contactName}`);
      this.log(`Search error: ${error.message}`, 'error');
      if (browser) await browser.close();
      return [];
    }
  }

  async verifyContact(contact) {
    const companyName = contact.Account?.Name || 'Unknown Company';
    
    if (companyName === 'Unknown Company') {
      return {
        id: contact.Id,
        name: contact.Name,
        status: 'UNKNOWN',
        notes: 'No company information available for verification',
        sourceUrl: ''
      };
    }
    
    const searchResults = await this.searchLinkedIn(contact.Name, companyName);
    
    let status = 'UNKNOWN';
    let notes = 'Could not find contact on LinkedIn';
    let sourceUrl = '';
    
    if (searchResults.length > 0) {
      const bestMatch = searchResults[0];
      
      // Matching logic
      const nameParts = contact.Name.toLowerCase().split(' ');
      const titleLower = bestMatch.title.toLowerCase();
      const snippetLower = bestMatch.snippet.toLowerCase();
      
      const nameMatch = nameParts.every(part => 
        titleLower.includes(part) || snippetLower.includes(part)
      );
      
      const companyMatch = snippetLower.includes(companyName.toLowerCase());
      
      if (nameMatch && companyMatch) {
        status = 'CONFIRMED';
        notes = `Contact verified via LinkedIn. Found: ${bestMatch.title}`;
        sourceUrl = bestMatch.url;
      } else if (nameMatch) {
        status = 'OUTDATED';
        notes = `Person found but may have changed companies. Current info: ${bestMatch.title}`;
        sourceUrl = bestMatch.url;
      } else {
        status = 'UNKNOWN';
        notes = `Found LinkedIn results but couldn't confirm match. Best result: ${bestMatch.title}`;
      }
    }
    
    return {
      id: contact.Id,
      name: contact.Name,
      status: status,
      notes: notes,
      sourceUrl: sourceUrl
    };
  }

  async updateSalesforce(verificationResults) {
    if (this.dryRun) {
      console.log('\n🧪 DRY RUN - No updates will be made to Salesforce'.yellow);
      return;
    }
    
    const spinner = ora('Updating Salesforce records...').start();
    
    try {
      let successCount = 0;
      let errorCount = 0;
      
      for (const result of verificationResults) {
        try {
          const updateData = {
            Id: result.id,
            Verification_Status__c: result.status,
            Verification_Notes__c: result.notes,
            Last_Verified__c: new Date().toISOString().split('T')[0]
          };
          
          if (result.sourceUrl) {
            updateData.Source_URL__c = result.sourceUrl;
          }
          
          await this.conn.sobject('Contact').update(updateData);
          successCount++;
          
        } catch (updateError) {
          errorCount++;
          this.log(`Failed to update ${result.name}: ${updateError.message}`, 'error');
        }
      }
      
      spinner.succeed(`Updated ${successCount} contacts (${errorCount} errors)`);
      
    } catch (error) {
      spinner.fail('Error updating Salesforce');
      this.log(`Update error: ${error.message}`, 'error');
    }
  }

  async generateReport(results) {
    const summary = results.reduce((acc, result) => {
      acc[result.status] = (acc[result.status] || 0) + 1;
      return acc;
    }, {});
    
    console.log('\n📊 VERIFICATION SUMMARY'.bold);
    console.log('='.repeat(50));
    
    Object.entries(summary).forEach(([status, count]) => {
      const percentage = ((count / results.length) * 100).toFixed(1);
      const statusColor = {
        'CONFIRMED': 'green',
        'OUTDATED': 'yellow',
        'UNKNOWN': 'red'
      }[status] || 'white';
      
      console.log(`${status}: ${count} contacts (${percentage}%)`[statusColor]);
    });
    
    console.log('='.repeat(50));
    console.log(`Total processed: ${results.length}`.bold);
    
    if (this.verbose) {
      console.log('\n📋 DETAILED RESULTS'.bold);
      results.forEach((result, index) => {
        console.log(`${index + 1}. ${result.name} - ${result.status}`.gray);
        console.log(`   ${result.notes}`.gray);
        if (result.sourceUrl) {
          console.log(`   Source: ${result.sourceUrl}`.gray);
        }
        console.log('');
      });
    }
  }
}

// Main execution
async function main() {
  console.log('🚀 Salesforce Contact Verification System'.bold.blue);
  console.log('==========================================\n');
  
  if (options.dryRun) {
    console.log('🧪 Running in DRY RUN mode - no changes will be made'.yellow);
  }
  
  const verifier = new ContactVerifier();
  
  // Connect to Salesforce
  const connected = await verifier.connectToSalesforce();
  if (!connected) {
    console.log('❌ Cannot continue without Salesforce connection'.red);
    process.exit(1);
  }
  
  // Get contacts to verify
  const contacts = await verifier.getContactsToVerify();
  if (contacts.length === 0) {
    console.log('ℹ️ No contacts found that need verification'.yellow);
    return;
  }
  
  // Verify each contact
  console.log('\n🔍 Starting verification process...\n');
  const results = [];
  
  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    console.log(`\n[${i + 1}/${contacts.length}] Processing: ${contact.Name}`.bold);
    
    const result = await verifier.verifyContact(contact);
    results.push(result);
    
    // Progress indicator
    const statusEmoji = {
      'CONFIRMED': '✅',
      'OUTDATED': '⚠️',
      'UNKNOWN': '❓'
    }[result.status] || '❓';
    
    console.log(`${statusEmoji} ${result.status}: ${result.notes}`.gray);
    
    // Respectful delay between requests
    if (i < contacts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  // Update Salesforce
  await verifier.updateSalesforce(results);
  
  // Generate report
  await verifier.generateReport(results);
  
  console.log('\n🎉 Verification complete!'.green.bold);
}

// Handle errors gracefully
process.on('uncaughtException', (error) => {
  console.error('💥 Unexpected error:', error.message.red);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled promise rejection:', reason);
  process.exit(1);
});

// Run the program
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Fatal error:', error.message.red);
    process.exit(1);
  });
}

module.exports = ContactVerifier;
