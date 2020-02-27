const karma = require('karma');
const path = require('path');

process.env.BUILD_DIR = 'dist';
process.env.MINIFIED = 'false';

const karmaTest = async ({ version }) => {
  const configFile = path.join(
    __dirname,
    version,
    `karma-standalone.conf.js`
  );

  await new Promise((resolve, reject) =>
    new karma.Server(
      {
        configFile,
        singleRun: true, // Set as false to debug in browser
      },
      err => {
        if (err) {
          return reject(err);
        }
        return resolve();
      }
    ).start());
};

async function runTests() {
  // Test our development version
  await karmaTest({ version: '1.2' });
  await karmaTest({ version: '2.0' });

  // Test our production minified version
  process.env.MINIFIED = 'true';
  await karmaTest({ version: '1.2' });
  await karmaTest({ version: '2.0' });
}

try {
  runTests();
} catch (err) {
  console.log('Karma test failed', err);
  process.exit(1);
}
