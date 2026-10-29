export const nopii2 = [
`Order #1234567812345678 failed validation: checksum mismatch.`,
`Tracking number 9400111899223197428490 is in transit.`,
`Customer id 123456789 migrated to tenant 987654321.`,
`PR #4412 merged; closes #4398 and #4401.`,
`Released v2.0.0-rc.1 on 2024-03-12; previous: v1.9.7 (2024-02-01).`,
`Build 20240312.4 succeeded in 3m 42s (agent pool: ubuntu-22.04).`,
`Call stack size exceeded after 10000 frames at depth 9998.`,
`pip install -r requirements.txt --no-cache-dir && python -m pytest -q`,
`yarn workspace @acme/web add react-query@^5.0.0`,
`cargo test --release -- --nocapture
running 12 tests
test parser::tests::empty_input ... ok
test result: ok. 12 passed; 0 failed`,
`go test ./... -race -count=1
ok  	github.com/acme/api/internal/store	1.842s
FAIL	github.com/acme/api/internal/queue	0.512s`,
`mvn -q clean verify -DskipITs
[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.11.0:compile`,
`systemctl status nginx
● nginx.service - A high performance web server
     Active: active (running) since Tue 2024-03-12 08:00:01 UTC; 2h 14min ago
   Main PID: 1042 (nginx)`,
`top - 10:14:02 up 12 days,  3:22,  1 user,  load average: 0.52, 0.48, 0.45
Tasks: 213 total,   1 running, 212 sleeping`,
`ping -c 3 10.0.0.1
64 bytes from 10.0.0.1: icmp_seq=1 ttl=64 time=0.412 ms`,
`CIDR blocks: 10.0.0.0/16, 172.16.0.0/12, 192.168.0.0/24; gateway 192.168.0.1.`,
`Listening on 0.0.0.0:3000 and [::]:3000 (dual stack).`,
`SELECT COUNT(*) AS n, status FROM jobs WHERE created_at >= NOW() - INTERVAL '7 days' GROUP BY status;`,
`UPDATE accounts SET balance = balance - 100.00 WHERE id = 42 AND balance >= 100.00;`,
`ALTER TABLE orders ADD COLUMN shipped_at TIMESTAMPTZ;
CREATE INDEX idx_orders_shipped ON orders (shipped_at);`,
`.btn { padding: 8px 16px; border-radius: 4px; color: #1a73e8; }
@media (max-width: 768px) { .btn { padding: 4px 8px; } }`,
`<form action="/signup" method="post">
  <input type="email" name="email" placeholder="Email address">
  <input type="password" name="password">
</form>`,
`async function fetchUser(id) {
  const res = await fetch(\`/api/users/\${id}\`);
  if (!res.ok) throw new Error('failed');
  return res.json();
}`,
`@Entity
public class Customer {
  @Id private Long id;
  private String firstName;
  private String lastName;
  private String emailAddress;
}`,
`const SAMPLE = { firstName: 'string', lastName: 'string', age: 'number', phone: 'string' };`,
`validate_email(address: str) -> bool: checks RFC 5322 format; see tests for examples.`,
`Mask the phone number field in the UI and never log the SSN; see the privacy policy for details.`,
`jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22, 24]
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test`,
`services:
  db:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_PASSWORD: example
      POSTGRES_DB: app`,
`[tool.ruff]
line-length = 100
select = ["E", "F", "I"]

[tool.pytest.ini_options]
addopts = "-ra -q"`,
`resource "aws_s3_bucket" "logs" {
  bucket = "acme-logs-eu-central-1"
  tags   = { env = "prod", team = "platform" }
}`,
`server {
    listen 443 ssl http2;
    server_name api.example.com;
    location / { proxy_pass http://127.0.0.1:3000; }
}`,
`Visit https://example.com/docs/getting-started#install or http://localhost:8080/health.`,
`Frankfurt, Dublin and Singapore are our three edge regions; Virginia hosts the primary database.`,
`Latency from São Paulo to Oregon is about 180 ms on the public internet.`,
`The conference is in Berlin this year; talks cover Kubernetes, Terraform and Rust.`,
`Install Xcode from the Mac App Store, then run xcode-select --install. Works with macOS Sonoma 14.4.`,
`Microsoft Azure, Google Cloud, Amazon Web Services and Cloudflare all offer managed Kubernetes.`,
`We migrated from MongoDB to PostgreSQL and from Heroku to Fly.io; Stripe handles billing.`,
`The Pythagorean theorem states a^2 + b^2 = c^2. For n=5, the sum 1+2+3+4+5 = 15 and 5! = 120.`,
`e = mc^2; lim_{x->0} sin(x)/x = 1; matrix A in R^{3x3} has det(A) = -2.`,
`See RFC 9110 section 15.5.5 (404 Not Found) and ISO 8601 for the timestamp format.`,
`Q: Why does my build fail on CI but pass locally?
A: Usually a different Node version or a missing lockfile entry.`,
`Refactor plan: extract the pricing module, add contract tests, then delete the legacy path. Estimated 3 sprints.`,
`The release is scheduled for Thursday. Please update the changelog before then.`,
`Reminder: the maintenance window is 02:00-04:00 UTC on 2024-03-16. Expect brief downtime.`,
`WARN  deprecated API usage: Buffer() is deprecated, use Buffer.alloc() instead (DEP0005)`,
`Segmentation fault (core dumped)
#0  0x00007ffff7a4d1c8 in raise () from /lib/x86_64-linux-gnu/libc.so.6
#1  0x0000555555555189 in main () at main.c:7`,
`java.lang.OutOfMemoryError: Java heap space
	at java.base/java.util.Arrays.copyOf(Arrays.java:3512)
	at com.acme.cache.Store.put(Store.java:88)`,
`ModuleNotFoundError: No module named 'pandas'
ImportError: cannot import name 'foo' from 'bar' (/usr/lib/python3/dist-packages/bar/__init__.py)`,
`FATAL: password authentication failed for user "app"
LOG:  checkpoint complete: wrote 412 buffers (2.5%); write=0.103 s, total=0.221 s`,
`random seed 1337; batch_size=64; lr=3e-4; epochs=20; val_acc=0.9412; loss=0.1873`,
`Bitcoin address example and base64: SGVsbG8sIFdvcmxkIQ== ; hex: 0xDEADBEEF; mac: 00:1A:2B:3C:4D:5E`,
`Das Update ist fertig. Bitte starten Sie den Server neu und prüfen Sie die Logs.`,
`Le déploiement a échoué : vérifiez la configuration et relancez la pipeline.`,
`De build is geslaagd; de tests duren ongeveer vier minuten.`,
`El servidor se reinicia cada noche a las 03:00 para aplicar parches.`,
`Phone-like constants: PORT_RANGE 5550100-5550199, TIMEOUT_MS 3000000000, MAX_ID 4294967295.`,
`Version 1.234.567 of the schema (build 555-0100-77) is deprecated.`,
`Alice and Bob exchange keys; Eve intercepts. Mallory modifies the message. (Cryptography example.)`,
`Dear maintainers, thank you for the library. A small request: please add TypeScript types.`,
`Marked as duplicate of #2210. Closing.`,
];
