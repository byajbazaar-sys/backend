const mongoose = require('mongoose');

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || 27017;
const database = process.env.DB_NAME || 'jobs_db';
const username = process.env.DB_USERNAME || '';
const password = process.env.DB_PASSWORD || '';

const uri = username && password
  ? `mongodb://${username}:${password}@${host}:${port}/${database}?retryWrites=true&w=majority`
  : `mongodb://${host}:${port}/${database}`;

console.log(`Attempting to connect to MongoDB at ${host}:${port}/${database}...`);

mongoose.connect(uri, {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
})
  .then(() => {
    console.log('✅ MongoDB connection successful!');
    mongoose.connection.db.admin().ping()
      .then(() => {
        console.log('✅ MongoDB ping successful!');
        mongoose.connection.close();
        process.exit(0);
      })
      .catch((err) => {
        console.error('❌ MongoDB ping failed:', err.message);
        mongoose.connection.close();
        process.exit(1);
      });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    console.error('\nPlease check:');
    console.error('1. MongoDB is running: mongod --version');
    console.error('2. MongoDB is accessible at:', uri);
    console.error('3. Environment variables are set correctly');
    process.exit(1);
  });
