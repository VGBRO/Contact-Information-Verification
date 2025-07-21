#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

// Import your existing Salesforce logic
const { getSalesforceConnection, verifyContact, getContacts } = require('./verify-contacts.js');

class SalesforceVerifierServer {
  constructor() {
    this.server = new Server(
      {
        name: 'salesforce-verifier',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_contacts',
            description: 'Retrieve contacts from Salesforce that need verification',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum number of contacts to retrieve',
                  default: 10
                },
                months: {
                  type: 'number', 
                  description: 'Contacts not verified in this many months',
                  default: 6
                }
              }
            }
          },
          {
            name: 'verify_contact',
            description: 'Verify a single contact by searching professional networks',
            inputSchema: {
              type: 'object',
              properties: {
                contactId: {
                  type: 'string',
                  description: 'Salesforce Contact ID'
                },
                contactName: {
                  type: 'string',
                  description: 'Contact name for verification'
                },
                company: {
                  type: 'string',
                  description: 'Contact company for verification'
                }
              },
              required: ['contactId']
            }
          },
          {
            name: 'update_contact_verification',
            description: 'Update contact verification status in Salesforce',
            inputSchema: {
              type: 'object',
              properties: {
                contactId: {
                  type: 'string',
                  description: 'Salesforce Contact ID'
                },
                status: {
                  type: 'string',
                  enum: ['CONFIRMED', 'OUTDATED', 'UNKNOWN'],
                  description: 'Verification status'
                },
                notes: {
                  type: 'string',
                  description: 'Verification notes'
                }
              },
              required: ['contactId', 'status']
            }
          },
          {
            name: 'get_verification_stats',
            description: 'Get statistics about contact verification',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_contacts':
            return await this.getContacts(args);
          case 'verify_contact':
            return await this.verifyContact(args);
          case 'update_contact_verification':
            return await this.updateContactVerification(args);
          case 'get_verification_stats':
            return await this.getVerificationStats(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ]
        };
      }
    });
  }

  async getContacts(args) {
    const { limit = 10, months = 6 } = args;
    // Use your existing getContacts logic
    const contacts = await getContacts(limit, months);
    
    return {
      content: [
        {
          type: 'text',
          text: `Found ${contacts.length} contacts that need verification:\n` +
                contacts.map(c => `• ${c.Name} (${c.Company || 'No Company'})`).join('\n')
        }
      ]
    };
  }

  async verifyContact(args) {
    const { contactId, contactName, company } = args;
    // Use your existing verifyContact logic
    const result = await verifyContact(contactId, contactName, company);
    
    return {
      content: [
        {
          type: 'text',
          text: `Verification result for ${contactName}:\n` +
                `Status: ${result.status}\n` +
                `Notes: ${result.notes}\n` +
                `Source: ${result.sourceUrl || 'N/A'}`
        }
      ]
    };
  }

  async updateContactVerification(args) {
    const { contactId, status, notes } = args;
    // Update Salesforce record
    const conn = await getSalesforceConnection();
    await conn.sobject('Contact').update({
      Id: contactId,
      Verification_Status__c: status,
      Verification_Notes__c: notes,
      Last_Verified__c: new Date().toISOString()
    });

    return {
      content: [
        {
          type: 'text',
          text: `Successfully updated contact ${contactId} with status: ${status}`
        }
      ]
    };
  }

  async getVerificationStats() {
    // Get verification statistics
    const conn = await getSalesforceConnection();
    const result = await conn.query(`
      SELECT Verification_Status__c, COUNT(Id) count 
      FROM Contact 
      WHERE Verification_Status__c != null 
      GROUP BY Verification_Status__c
    `);

    const stats = result.records.map(r => 
      `${r.Verification_Status__c}: ${r.count} contacts`
    ).join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `Contact Verification Statistics:\n${stats}`
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Salesforce Verifier MCP server running on stdio');
  }
}

const server = new SalesforceVerifierServer();
server.run().catch(console.error);
