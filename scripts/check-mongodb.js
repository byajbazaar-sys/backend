const mongoose = require('mongoose');

const uri = process.env.MONGO_URL || process.env.MONGODB_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/jobs_db';

console.log('Attempting to connect to MongoDB...');

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
    console.error('2. MONGO_URL (or MONGODB_URI/DATABASE_URL) is set correctly');
    process.exit(1);
  });
