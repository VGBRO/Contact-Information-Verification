const jsforce = require('jsforce');
const colors = require('colors');
const ora = require('ora');

// Load configuration
let config;
try {
  config = require('./config.json');
} catch (error) {
  console.error('❌ Error loading config.json. Make sure you copied config.example.json to config.json and filled in your credentials.'.red);
  process.exit(1);
}

class FieldSetup {
  constructor() {
    this.conn = new jsforce.Connection({
      loginUrl: config.salesforce.instanceUrl
    });
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

  async checkExistingFields() {
    const spinner = ora('Checking existing fields...').start();
    
    try {
      const contactMetadata = await this.conn.sobject('Contact').describe();
      const existingFields = contactMetadata.fields.map(field => field.name);
      
      const requiredFields = [
        'Last_Verified__c',
        'Verification_Status__c', 
        'Verification_Notes__c',
        'Source_URL__c'
      ];
      
      const missingFields = requiredFields.filter(field => !existingFields.includes(field));
      
      if (missingFields.length === 0) {
        spinner.succeed('All required fields already exist!');
        return [];
      }
      
      spinner.succeed(`Found ${missingFields.length} fields that need to be created`);
      return missingFields;
      
    } catch (error) {
      spinner.fail('Error checking existing fields');
      console.error('Error details:', error.message.red);
      return null;
    }
  }

  async createFields(missingFields) {
    console.log('\n🔧 Creating custom fields...\n');
    
    const fieldDefinitions = {
      'Last_Verified__c': {
        type: 'Date',
        label: 'Last Verified',
        description: 'Date when the contact was last verified through the automated system'
      },
      'Verification_Status__c': {
        type: 'Picklist',
        label: 'Verification Status',
        description: 'Current verification status of the contact',
        picklistValues: [
          { fullName: 'New', default: true },
          { fullName: 'CONFIRMED', default: false },
          { fullName: 'OUTDATED', default: false },
          { fullName: 'UNKNOWN', default: false }
        ]
      },
      'Verification_Notes__c': {
        type: 'LongTextArea',
        label: 'Verification Notes',
        description: 'Detailed notes about the verification process and results',
        length: 5000
      },
      'Source_URL__c': {
        type: 'Url',
        label: 'Source URL',
        description: 'URL of the source where the contact information was verified'
      }
    };

    for (const fieldName of missingFields) {
      const fieldDef = fieldDefinitions[fieldName];
      const spinner = ora(`Creating field: ${fieldDef.label}`).start();
