#!/usr/bin/env node
// Generate PLATFORM_ADMIN_PASSWORD_HASH without writing the password to disk.
//
//   node scripts/hash-password.mjs                 (prompts, input hidden)
//   NYOTA_ADMIN_PASSWORD='...' node scripts/hash-password.mjs   (non-interactive)
//
// Prints:  PLATFORM_ADMIN_PASSWORD_HASH=scrypt$<saltHex>$<hashHex>
import { randomBytes, scryptSync } from 'node:crypto';

function hash(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

function emit(password) {
  const pw = String(password ?? '').trim();
  if (pw.length < 12) {
    console.error('Refusing: use at least 12 characters.');
    process.exit(1);
  }
  console.log(`\nPLATFORM_ADMIN_PASSWORD_HASH=${hash(pw)}\n`);
  process.exit(0);
}

// 1. Non-interactive paths first (works over pipes, cron, CI, and any shell).
if (process.env.NYOTA_ADMIN_PASSWORD) emit(process.env.NYOTA_ADMIN_PASSWORD);
if (process.argv[2]) emit(process.argv[2]);

// 2. Interactive prompt. Read raw bytes from the TTY so echo stays off and the
//    process always exits (no unsettled top-level await).
process.stdout.write('Platform admin password: ');

let buffer = '';
const stdin = process.stdin;
const isTty = Boolean(stdin.isTTY);
if (isTty) stdin.setRawMode(true);
stdin.resume();
stdin.setEncoding('utf8');

stdin.on('data', (chunk) => {
  for (const char of chunk) {
    if (char === '\r' || char === '\n' || char === '\u0004') {
      if (isTty) stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
      emit(buffer);
      return;
    }
    if (char === '\u0003') {
      // Ctrl-C
      if (isTty) stdin.setRawMode(false);
      process.stdout.write('\n');
      process.exit(130);
    }
    if (char === '\u007f' || char === '\b') {
      buffer = buffer.slice(0, -1);
      continue;
    }
    buffer += char;
  }
});

stdin.on('end', () => {
  process.stdout.write('\n');
  emit(buffer);
});
