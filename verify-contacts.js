const jsforce = require('jsforce');
const { program } = require('commander');
const colors = require('colors');
const ora = require('ora');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const axios = require('axios');

// Load configuration with better error handling
let config;
try {
  config = require('./config.json');
  
  // Validate required configuration
  if (!config.salesforce || !config.salesforce.instanceUrl || !config.salesforce.clientId) {
    throw new Error('Missing required Salesforce configuration');
  }
} catch (error) {
  console.error('❌ Configuration Error:'.red);
  console.error('   Make sure config.json exists and contains all required fields.'.red);
  console.error('   Copy config.example.json to config.json and fill in your credentials.'.red);
  process.exit(1);
}

// Command line options
program
  .version('2.0.0')
  .option('-l, --limit <number>', 'limit number of contacts to verify', '10')
  .option('-m, --months <number>', 'verify contacts not checked in X months', '6')
  .option('-d, --dry-run', 'run without updating Salesforce')
  .option('-v, --verbose', 'verbose logging')
  .option('-t, --test-email', 'include email validation')
  .parse();

const options = program.opts();

class ImprovedContactVerifier {
  constructor() {
    // Use OAuth connection instead of username/password
    this.conn = new jsforce.Connection({
      oauth2: {
        loginUrl: config.salesforce.instanceUrl,
        clientId: config.salesforce.clientId,
        clientSecret: config.salesforce.clientSecret,
        redirectUri: config.salesforce.redirectUri || 'http://localhost:3000/callback'
      }
    });
    
    this.dryRun = options.dryRun;
    this.verbose = options.verbose;
    this.testEmail = options.testEmail;
    
    // Rate limiting configuration
    this.requestCount = 0;
    this.lastRequestTime = 0;
    this.minDelayMs = 1000; // Minimum 1 second between operations
  }

  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const colorMap = {
      info: 'cyan',
      success: 'green',
      warning: 'yellow',
      error: 'red'
    };
    
    if (this.verbose || type !== 'info') {
      console.log(`[${timestamp}] ${message}`[colorMap[type]]);
    }
  }

  async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minDelayMs) {
      const delay = this.minDelayMs - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  async connectToSalesforce() {
    const spinner = ora('Connecting to Salesforce...').start();
    
    try {
      // Try to use existing access token if available
      if (config.salesforce.accessToken && config.salesforce.instanceUrl) {
        this.conn.accessToken = config.salesforce.accessToken;
        this.conn.instanceUrl = config.salesforce.instanceUrl;
        
        // Test the connection
        await this.conn.identity();
        spinner.succeed('Successfully connected to Salesforce with existing token!');
        return true;
      }
      
      // Fall back to username/password if no token (but warn about it)
      if (config.salesforce.username && config.salesforce.password) {
        this.log('Warning: Using username/password authentication. Consider switching to OAuth for better security.', 'warning');
        await this.conn.login(config.salesforce.username, config.salesforce.password);
        spinner.succeed('Successfully connected to Salesforce!');
        return true;
      }
      
      spinner.fail('No valid authentication method found');
      console.error('Please configure either OAuth tokens or username/password in config.json'.red);
      return false;
      
    } catch (error) {
      spinner.fail('Failed to connect to Salesforce');
      console.error('Error details:', error.message.red);
      
      if (error.message.includes('INVALID_LOGIN')) {
        console.error('Hint: Check your username, password, and security token'.yellow);
      }
      
      return false;
    }
  }

  async getContactsToVerify() {
    const spinner = ora('Getting contacts to verify...').start();
    
    try {
      await this.enforceRateLimit();
      
      const query = `
        SELECT Id, Name, Account.Name, Title, Email, Phone, Last_Verified__c, 
               Verification_Status__c, LastModifiedDate, CreatedDate
        FROM Contact 
        WHERE (Last_Verified__c < LAST_N_MONTHS:${options.months} OR Last_Verified__c = null)
        AND AccountId != null 
        AND Name != null
        AND IsDeleted = false
        ORDER BY LastModifiedDate DESC
        LIMIT ${options.limit}
      `;
      
      const result = await this.conn.query(query);
      spinner.succeed(`Found ${result.records.length} contacts to verify`);
      
      if (this.verbose) {
        result.records.forEach((contact, index) => {
          const company = contact.Account?.Name || 'Unknown Company';
          const lastVerified = contact.Last_Verified__c ? 
            new Date(contact.Last_Verified__c).toDateString() : 'Never';
          console.log(`${index + 1}. ${contact.Name} (${company}) - Last verified: ${lastVerified}`.gray);
        });
      }
      
      return result.records;
    } catch (error) {
      spinner.fail('Error getting contacts');
      console.error('Error details:', error.message.red);
      return [];
    }
  }

  async validateEmail(email) {
    if (!email || !this.testEmail) {
      return { valid: null, reason: 'Email validation disabled' };
    }

    try {
      // Basic format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return { valid: false, reason: 'Invalid email format' };
      }

      // Extract domain
      const domain = email.split('@')[1];
      
      // DNS MX record check
      await this.enforceRateLimit();
      const mxRecords = await dns.resolveMx(domain);
      
      if (mxRecords && mxRecords.length > 0) {
        return { valid: true, reason: 'Domain has valid MX records' };
      } else {
        return { valid: false, reason: 'No MX records found for domain' };
      }
      
    } catch (error) {
      return { valid: false, reason: `DNS lookup failed: ${error.code}` };
    }
  }

  calculateNameSimilarity(name1, name2) {
    if (!name1 || !name2) return 0;
    
    // Simple similarity scoring
    const normalize = (str) => str.toLowerCase().trim().replace(/[^a-z\s]/g, '');
    const n1 = normalize(name1);
    const n2 = normalize(name2);
    
    if (n1 === n2) return 1.0;
    
    // Check if all words in one name appear in the other
    const words1 = n1.split(/\s+/).filter(w => w.length > 1);
    const words2 = n2.split(/\s+/).filter(w => w.length > 1);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    const matches = words1.filter(word => words2.some(w => w.includes(word) || word.includes(w)));
    return matches.length / Math.max(words1.length, words2.length);
  }

  async verifyContactData(contact) {
    const companyName = contact.Account?.Name || 'Unknown Company';
    
    this.log(`Verifying data quality for ${contact.Name}...`);
    
    let verificationStatus = {
      dataQuality: 'GOOD',
      issues: [],
      recommendations: [],
      confidence: 0.8
    };

    // Check for missing critical data
    if (!contact.Name || contact.Name.trim().length < 2) {
      verificationStatus.issues.push('Name is missing or too short');
      verificationStatus.dataQuality = 'POOR';
      verificationStatus.confidence -= 0.3;
    }

    if (companyName === 'Unknown Company' || !contact.Account?.Name) {
      verificationStatus.issues.push('No company information available');
      verificationStatus.dataQuality = 'FAIR';
      verificationStatus.confidence -= 0.2;
    }

    if (!contact.Title) {
      verificationStatus.issues.push('Job title is missing');
      verificationStatus.recommendations.push('Add job title for better identification');
      verificationStatus.confidence -= 0.1;
    }

    // Validate email if present and email testing is enabled
    if (contact.Email) {
      const emailValidation = await this.validateEmail(contact.Email);
      if (emailValidation.valid === false) {
        verificationStatus.issues.push(`Email issue: ${emailValidation.reason}`);
        verificationStatus.dataQuality = 'FAIR';
        verificationStatus.confidence -= 0.2;
      } else if (emailValidation.valid === true) {
        verificationStatus.recommendations.push('Email domain appears valid');
      }
    } else {
      verificationStatus.recommendations.push('Consider adding email address');
    }

    // Check for stale data
    const lastModified = new Date(contact.LastModifiedDate);
    const monthsOld = (Date.now() - lastModified) / (1000 * 60 * 60 * 24 * 30);
    
    if (monthsOld > 12) {
      verificationStatus.issues.push(`Contact not updated in ${Math.floor(monthsOld)} months`);
      verificationStatus.recommendations.push('Consider reaching out to verify current information');
      verificationStatus.confidence -= 0.1;
    }

    // Determine overall status
    if (verificationStatus.issues.length === 0) {
      verificationStatus.status = 'CONFIRMED';
    } else if (verificationStatus.issues.length <= 2 && verificationStatus.confidence > 0.5) {
      verificationStatus.status = 'NEEDS_REVIEW';
    } else {
      verificationStatus.status = 'OUTDATED';
    }

    return {
      id: contact.Id,
      name: contact.Name,
      company: companyName,
      status: verificationStatus.status,
      confidence: Math.max(0, Math.min(1, verificationStatus.confidence)),
      issues: verificationStatus.issues,
      recommendations: verificationStatus.recommendations,
      notes: this.generateVerificationNotes(verificationStatus),
      lastModified: contact.LastModifiedDate
    };
  }

  generateVerificationNotes(verificationStatus) {
    let notes = [`Data quality assessment: ${verificationStatus.dataQuality}.`];
    
    if (verificationStatus.issues.length > 0) {
      notes.push(`Issues found: ${verificationStatus.issues.join(', ')}.`);
    }
    
    if (verificationStatus.recommendations.length > 0) {
      notes.push(`Recommendations: ${verificationStatus.recommendations.join(', ')}.`);
    }
    
    notes.push(`Confidence score: ${(verificationStatus.confidence * 100).toFixed(0)}%.`);
    
    return notes.join(' ');
  }

  async updateSalesforce(verificationResults) {
    if (this.dryRun) {
      console.log('\n🧪 DRY RUN - No updates will be made to Salesforce'.yellow);
      this.displayResults(verificationResults);
      return;
    }
    
    const spinner = ora('Updating Salesforce records...').start();
    
    try {
      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      
      // Process updates in batches for better performance
      const batchSize = 10;
      
      for (let i = 0; i < verificationResults.length; i += batchSize) {
        const batch = verificationResults.slice(i, i + batchSize);
        
        await this.enforceRateLimit();
        
        const updatePromises = batch.map(async (result) => {
          try {
            const updateData = {
              Id: result.id,
              Verification_Status__c: result.status,
              Verification_Notes__c: result.notes,
              Last_Verified__c: new Date().toISOString().split('T')[0]
            };
            
            await this.conn.sobject('Contact').update(updateData);
            successCount++;
            this.log(`✅ Updated ${result.name}`);
            
          } catch (updateError) {
            errorCount++;
            const errorMsg = `Failed to update ${result.name}: ${updateError.message}`;
            errors.push(errorMsg);
            this.log(errorMsg, 'error');
          }
        });
        
        await Promise.all(updatePromises);
      }
      
      if (errorCount === 0) {
        spinner.succeed(`Successfully updated all ${successCount} contacts`);
      } else {
        spinner.warn(`Updated ${successCount} contacts with ${errorCount} errors`);
        
        if (this.verbose && errors.length > 0) {
          console.log('\nDetailed Errors:'.red);
          errors.forEach(error => console.log(`  • ${error}`.red));
        }
      }
      
    } catch (error) {
      spinner.fail('Error during Salesforce update');
      this.log(`Batch update error: ${error.message}`, 'error');
    }
  }

  displayResults(results) {
    if (this.dryRun) {
      console.log('\n📋 RESULTS PREVIEW (Dry Run)'.bold);
    }
    
    results.forEach((result, index) => {
      const statusEmoji = {
        'CONFIRMED': '✅',
        'NEEDS_REVIEW': '⚠️',
        'OUTDATED': '❌'
      }[result.status] || '❓';
      
      console.log(`\n${index + 1}. ${result.name} (${result.company})`.bold);
      console.log(`   Status: ${statusEmoji} ${result.status}`.gray);
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(0)}%`.gray);
      console.log(`   Notes: ${result.notes}`.gray);
      
      if (result.issues.length > 0) {
        console.log(`   Issues: ${result.issues.join(', ')}`.red);
      }
      
      if (result.recommendations.length > 0) {
        console.log(`   Recommendations: ${result.recommendations.join(', ')}`.yellow);
      }
    });
  }

  async generateReport(results) {
    const summary = results.reduce((acc, result) => {
      acc[result.status] = (acc[result.status] || 0) + 1;
      acc.totalConfidence = (acc.totalConfidence || 0) + result.confidence;
      return acc;
    }, {});
    
    const avgConfidence = summary.totalConfidence / results.length;
    
    console.log('\n📊 VERIFICATION SUMMARY'.bold);
    console.log('='.repeat(60));
    
    Object.entries(summary).forEach(([status, count]) => {
      if (status === 'totalConfidence') return;
      
      const percentage = ((count / results.length) * 100).toFixed(1);
      const statusColor = {
        'CONFIRMED': 'green',
        'NEEDS_REVIEW': 'yellow',
        'OUTDATED': 'red'
      }[status] || 'white';
      
      console.log(`${status.padEnd(15)}: ${count.toString().padStart(3)} contacts (${percentage.padStart(5)}%)`[statusColor]);
    });
    
    console.log('='.repeat(60));
    console.log(`Total processed: ${results.length}`.bold);
    console.log(`Average confidence: ${(avgConfidence * 100).toFixed(1)}%`.bold);
    console.log(`Processing rate: ${this.requestCount} API calls made`.gray);
    
    // Generate actionable insights
    console.log('\n💡 INSIGHTS & RECOMMENDATIONS'.bold);
    
    const needsReview = results.filter(r => r.status === 'NEEDS_REVIEW').length;
    const outdated = results.filter(r => r.status === 'OUTDATED').length;
    
    if (needsReview > 0) {
      console.log(`• ${needsReview} contacts need manual review for data quality issues`.yellow);
    }
    
    if (outdated > 0) {
      console.log(`• ${outdated} contacts are likely outdated and may need outreach`.red);
    }
    
    if (avgConfidence < 0.7) {
      console.log('• Overall data quality is below optimal - consider data enrichment services'.yellow);
    }
    
    const emailIssues = results.filter(r => 
      r.issues.some(issue => issue.toLowerCase().includes('email'))
    ).length;
    
    if (emailIssues > 0) {
      console.log(`• ${emailIssues} contacts have email-related issues`.yellow);
    }
  }

  async saveReport(results) {
    try {
      const reportData = {
        timestamp: new Date().toISOString(),
        summary: results.reduce((acc, result) => {
          acc[result.status] = (acc[result.status] || 0) + 1;
          return acc;
        }, {}),
        totalProcessed: results.length,
        averageConfidence: results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
        details: results
      };
      
      const fileName = `verification-report-${Date.now()}.json`;
      fs.writeFileSync(fileName, JSON.stringify(reportData, null, 2));
      
      console.log(`\n📄 Report saved to: ${fileName}`.green);
      
    } catch (error) {
      this.log(`Failed to save report: ${error.message}`, 'error');
    }
  }
}

// Main execution function
async function main() {
  console.log('🚀 Improved Salesforce Contact Verification System v2.0'.bold.blue);
  console.log('========================================================\n');
  
  if (options.dryRun) {
    console.log('🧪 Running in DRY RUN mode - no changes will be made to Salesforce'.yellow);
  }
  
  if (options.testEmail) {
    console.log('📧 Email validation enabled'.cyan);
  }
  
  const verifier = new ImprovedContactVerifier();
  
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
    
    try {
      const result = await verifier.verifyContactData(contact);
      results.push(result);
      
      // Progress indicator
      const statusEmoji = {
        'CONFIRMED': '✅',
        'NEEDS_REVIEW': '⚠️',
        'OUTDATED': '❌'
      }[result.status] || '❓';
      
      console.log(`${statusEmoji} ${result.status} (${(result.confidence * 100).toFixed(0)}% confidence)`.gray);
      
    } catch (error) {
      verifier.log(`Error processing ${contact.Name}: ${error.message}`, 'error');
      
      // Add error result so we don't lose track
      results.push({
        id: contact.Id,
        name: contact.Name,
        company: contact.Account?.Name || 'Unknown',
        status: 'ERROR',
        confidence: 0,
        issues: ['Processing error occurred'],
        recommendations: ['Manual review required'],
        notes: `Error during verification: ${error.message}`,
        lastModified: contact.LastModifiedDate
      });
    }
  }
  
  // Update Salesforce
  await verifier.updateSalesforce(results);
  
  // Generate and display report
  await verifier.generateReport(results);
  
  // Save detailed report
  await verifier.saveReport(results);
  
  console.log('\n🎉 Verification complete!'.green.bold);
  console.log('Check the generated report file for detailed results.'.gray);
}

// Improved error handling
process.on('uncaughtException', (error) => {
  console.error('💥 Unexpected error occurred:'.red);
  console.error(`   ${error.message}`.red);
  console.error('   The application will now exit safely.'.red);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled promise rejection:'.red);
  console.error(`   ${reason}`.red);
  console.error('   The application will now exit safely.'.red);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️ Received interrupt signal. Shutting down gracefully...'.yellow);
  process.exit(0);
});

// Run the program
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Fatal error during execution:'.red);
    console.error(`   ${error.message}`.red);
    if (error.stack) {
      console.error('   Stack trace:'.gray);
      console.error(`   ${error.stack}`.gray);
    }
    process.exit(1);
  });
}

module.exports = ImprovedContactVerifier;
