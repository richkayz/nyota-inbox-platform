#!/usr/bin/env node
// Generate PLATFORM_ADMIN_PASSWORD_HASH without ever writing the password to disk.
//
//   node scripts/hash-password.mjs
//   (prompts for the password, prints the hash line to paste into the gateway env)
import { createInterface } from 'node:readline';
import { randomBytes, scryptSync } from 'node:crypto';

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    // Mute echo so the password is not shown or captured by the terminal scrollback.
    const onData = (char) => {
      if (char === '\r' || char === '\n' || char === '\u0004') process.stdin.removeListener('data', onData);
    };
    rl.output.write(question);
    rl._writeToOutput = () => {};
    process.stdin.on('data', onData);
    rl.question('', (answer) => {
      rl.output.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

const password = (await prompt('Platform admin password: ')).trim();
if (password.length < 12) {
  console.error('Refusing: use at least 12 characters.');
  process.exit(1);
}
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
console.log(`\nPLATFORM_ADMIN_PASSWORD_HASH=scrypt$${salt.toString('hex')}$${hash.toString('hex')}\n`);
