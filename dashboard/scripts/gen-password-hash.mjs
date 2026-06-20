// Generate a KARST_ADMIN_PASSWORD_HASH for a password you choose.
//
//   npm run hash-password
//
// It prompts (input hidden) and prints the env line to paste into Vercel and
// .env.local. You can also pass the password as an argument (note: that leaves
// it in your shell history):
//
//   node scripts/gen-password-hash.mjs "my secret password"
//
// The format matches lib/auth.ts exactly (scrypt N=16384, r=8, p=1, keylen=64).
import { scryptSync, randomBytes } from 'node:crypto';
import readline from 'node:readline';

const N = 16384;
const KEYLEN = 64;

function hash(plain) {
  const salt = randomBytes(16);
  const h = scryptSync(plain, salt, KEYLEN, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt:N=${N}:${salt.toString('hex')}:${h.toString('hex')}`;
}

function emit(pw) {
  if (!pw || pw.length < 8) {
    console.error('\n✗ Password must be at least 8 characters.');
    process.exit(1);
  }
  console.log('\n\nPaste this into Vercel (and .env.local):\n');
  console.log('KARST_ADMIN_PASSWORD_HASH=' + hash(pw) + '\n');
  process.exit(0);
}

const argPw = process.argv[2];
if (argPw) {
  emit(argPw);
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  // Mask typed characters with '*'. The prompt itself is written before muting.
  rl._writeToOutput = function (str) {
    rl.output.write(rl.stdoutMuted ? '*' : str);
  };
  rl.question('Choose an admin password: ', (pw) => {
    rl.close();
    emit(pw.trim());
  });
  rl.stdoutMuted = true;
}
