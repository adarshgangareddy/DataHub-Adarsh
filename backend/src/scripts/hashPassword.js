// Usage: npm run hash-password        (prompts for the password; nothing is echoed)
// Prints a bcrypt hash to paste into ADMIN_PASSWORD_HASH in backend/.env
import readline from 'node:readline';
import bcrypt from 'bcryptjs';

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.output.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

const password = await askHidden('New admin password (min 12 characters): ');
if (password.length < 12) {
  console.error('Password is too short. Use at least 12 characters.');
  process.exit(1);
}
const hash = await bcrypt.hash(password, 12);
console.log('\nAdd this line to backend/.env (keep the single quotes):\n');
console.log(`ADMIN_PASSWORD_HASH='${hash}'\n`);
