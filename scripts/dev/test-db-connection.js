/**
 * Quick Database Connection Test
 *
 * Tests if your DATABASE_URL is valid and database is accessible.
 * Run this before the full validation if you're having connection issues.
 *
 * Usage: node scripts/test-db-connection.js
 */

require('dotenv/config');
const { Pool } = require('pg');

async function testConnection() {
  console.log('\n🔌 Testing database connection...\n');

  // Check DATABASE_URL exists
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set!\n');
    console.error('Please create a .env file with:');
    console.error('DATABASE_URL="postgresql://user:password@localhost:5432/dbname"\n');
    process.exit(1);
  }

  // Parse and display connection info (without password)
  const url = new URL(process.env.DATABASE_URL);
  console.log('Connection details:');
  console.log(`  Host:     ${url.hostname}`);
  console.log(`  Port:     ${url.port || '5432'}`);
  console.log(`  Database: ${url.pathname.slice(1).split('?')[0]}`);
  console.log(`  User:     ${url.username}`);
  console.log(`  Password: ${'*'.repeat(8)}\n`);

  // Attempt connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });

  try {
    console.log('Attempting to connect...');
    const client = await pool.connect();
    console.log('✅ Connection successful!\n');

    // Test a simple query
    const result = await client.query('SELECT version()');
    console.log('PostgreSQL version:');
    console.log(`  ${result.rows[0].version.split(',')[0]}\n`);

    // Get database info
    const dbInfo = await client.query(`
      SELECT 
        current_database() as database,
        current_user as user,
        inet_server_addr() as server_ip,
        inet_server_port() as server_port
    `);
    console.log('Database info:');
    console.log(`  Current DB:   ${dbInfo.rows[0].database}`);
    console.log(`  Current User: ${dbInfo.rows[0].user}`);
    console.log(`  Server IP:    ${dbInfo.rows[0].server_ip || 'localhost'}`);
    console.log(`  Server Port:  ${dbInfo.rows[0].server_port || '5432'}\n`);

    client.release();
    await pool.end();

    console.log('✅ Database connection test passed!\n');
    console.log('You can now run: npm run db:validate\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Connection failed!\n');

    if (error.code === 'ECONNREFUSED') {
      console.error('Error: Connection refused');
      console.error('Possible causes:');
      console.error('  • PostgreSQL is not running');
      console.error('  • Wrong host or port in DATABASE_URL');
      console.error('  • Firewall blocking connection\n');
    } else if (error.code === '28P01') {
      console.error('Error: Authentication failed');
      console.error('Possible causes:');
      console.error('  • Wrong password in DATABASE_URL');
      console.error('  • User does not exist');
      console.error('  • User lacks login permission\n');
    } else if (error.code === '3D000') {
      console.error('Error: Database does not exist');
      console.error('Possible causes:');
      console.error('  • Database name is wrong in DATABASE_URL');
      console.error('  • Database needs to be created\n');
      console.error('Create it with:');
      console.error(`  createdb ${url.pathname.slice(1).split('?')[0]}\n`);
    } else {
      console.error(`Error: ${error.message}\n`);
    }

    console.error('Current DATABASE_URL (check your .env file):');
    console.error(`  ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@')}\n`);

    await pool.end();
    process.exit(1);
  }
}

testConnection();
