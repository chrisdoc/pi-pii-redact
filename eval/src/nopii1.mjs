export const nopii1 = [
`TypeError: Cannot read properties of undefined (reading 'map')
    at renderList (/app/src/components/List.js:42:18)
    at processChild (/app/node_modules/react-dom/cjs/react-dom.development.js:16123:14)
    at Object.<anonymous> (/app/src/index.js:9:1)`,
`Traceback (most recent call last):
  File "/usr/lib/python3.11/site-packages/requests/adapters.py", line 486, in send
    resp = conn.urlopen(method=request.method, url=url)
  File "manage.py", line 22, in main
    execute_from_command_line(sys.argv)
ConnectionError: HTTPSConnectionPool(host='api.example.com', port=443): Max retries exceeded`,
`Exception in thread "main" java.lang.NullPointerException: Cannot invoke "String.length()" because "s" is null
	at com.acme.util.Strings.trim(Strings.java:57)
	at com.acme.App.main(App.java:14)`,
`panic: runtime error: index out of range [5] with length 3

goroutine 1 [running]:
main.process(0xc000012345, 0x5)
	/home/build/go/src/app/main.go:27 +0x1d5
exit status 2`,
`thread 'main' panicked at 'called Option::unwrap() on a None value', src/main.rs:18:37
note: run with RUST_BACKTRACE=1 environment variable to display a backtrace`,
`error[E0382]: borrow of moved value: v
  --> src/lib.rs:12:20
   |
10 |     let v = vec![1, 2, 3];
11 |     let w = v;
12 |     println!("{:?}", v);
   |                      ^ value borrowed here after move`,
`src/index.ts:23:7 - error TS2322: Type 'string' is not assignable to type 'number'.

23   const n: number = "42";
         ~

Found 1 error in src/index.ts:23`,
`main.cpp:15:23: error: no match for 'operator<<' (operand types are 'std::ostream' and 'std::vector<int>')
   15 |     std::cout << v << std::endl;`,
` FAIL  tests/cart.test.ts > Cart > applies discount
AssertionError: expected 90 to be 100 // Object.is equality

 Test Files  1 failed | 4 passed (5)
      Tests  1 failed | 31 passed (32)
   Duration  2.41s`,
`PASS src/utils/format.test.js
  formatCurrency
    ✓ formats 1234.5 as $1,234.50 (3 ms)
    ✓ handles zero (1 ms)
Tests: 2 passed, 2 total
Time: 1.208 s`,
`added 1243 packages, and audited 1244 packages in 18s

187 packages are looking for funding
  run \`npm fund\` for details

found 0 vulnerabilities`,
`npm WARN deprecated request@2.88.2: request has been deprecated, see https://github.com/request/request/issues/3142
npm ERR! code ERESOLVE
npm ERR! ERESOLVE could not resolve`,
`Collecting numpy==1.26.4
  Downloading numpy-1.26.4-cp311-cp311-manylinux_2_17_x86_64.whl (18.2 MB)
Successfully installed numpy-1.26.4 pandas-2.2.1`,
`   Compiling serde v1.0.197
   Compiling tokio v1.36.0
    Finished dev [unoptimized + debuginfo] target(s) in 24.51s`,
`docker run -d --name web -p 8080:80 -v /srv/data:/data nginx:1.25-alpine`,
`CONTAINER ID   IMAGE          COMMAND                  CREATED        STATUS        PORTS                  NAMES
3f2a9c1b7d4e   nginx:1.25     "/docker-entrypoint.…"   2 hours ago    Up 2 hours    0.0.0.0:8080->80/tcp   web`,
`kubectl get pods -n production
NAME                       READY   STATUS    RESTARTS   AGE
api-7d9f8c6b5-x2k4p        1/1     Running   0          3d
worker-5c8d7f9b4-q9z8m     0/1     CrashLoopBackOff   12   45m`,
`apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: api
          image: registry.example.com/api:2.4.1
          resources:
            limits: {cpu: "500m", memory: 256Mi}`,
`FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
EXPOSE 3000
CMD ["node", "dist/server.js"]`,
`SELECT o.id, o.total, c.name FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.created_at > '2024-03-01' ORDER BY o.total DESC LIMIT 10;`,
`CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);`,
`[server]
host = 0.0.0.0
port = 8443
workers = 4
timeout = 30

[database]
pool_size = 10`,
`{
  "name": "my-app",
  "version": "1.4.2",
  "scripts": {"build": "tsc", "test": "vitest run"},
  "dependencies": {"react": "^18.2.0", "next": "14.1.0"}
}`,
`git checkout -b feature/PAY-4412-refund-flow
git add -A && git commit -m "feat: add refund flow"
git push -u origin feature/PAY-4412-refund-flow`,
`* 3f2a9c1 (HEAD -> main, origin/main) fix: handle empty cart
* b7c41de feat: add dark mode
* 9a0d5f3 chore(release): 1.4.2`,
`Merge branch 'release/2024.03' into main
Rebase onto 0f9e8d7c6b5a40312233445566778899aabbccdd`,
`## [1.4.2] - 2024-03-12
### Fixed
- Handle empty cart (#412)
## [1.4.1] - 2024-02-28
### Added
- Dark mode`,
`2024-03-12T10:14:02.123Z INFO server listening port=8080 pid=48213`,
`Mar 12 10:14:02 web-01 sshd[22871]: Accepted publickey for deploy from 10.0.4.17 port 51022 ssh2`,
`[10:14:02] request id=req_9f8e7d took 214ms status=200 bytes=10432`,
`epoch_ms=1710238502000 uuid=3b241101-e2bb-4255-8caf-4136c566a962 sha256=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08`,
`Order 4000123456789010 was placed (order number, not a card).`,
`Build number 555-0142 completed. Artifact id: 123456789.`,
`Ticket reference 202403121014 resolved in 3 days.`,
`Last run: 2024-03-12, next run: 2024-03-19 (weekly).`,
`const getUserName = (user) => user.firstName + ' ' + user.lastName;
export function getEmail(userId: string): Promise<string> { return db.email(userId); }`,
`def create_user(first_name, last_name, email):
    user_id = uuid4()
    return User(user_id=user_id, first_name=first_name, last_name=last_name, email=email)`,
`std::vector<std::string> names;
names.push_back("x");
std::unordered_map<int, std::pair<int, int>> m;`,
`impl Foo::Bar {
    pub fn new() -> Self { Foo::Bar::default() }
}
use std::collections::HashMap;`,
`type User struct {
	ID        int64  \`json:"id"\`
	FirstName string \`json:"first_name"\`
	Email     string \`json:"email"\`
}`,
`We deploy to us-east-1 and eu-central-1 (Frankfurt region); failover goes to the Washington region.`,
`terraform apply -var region=us-west-2 -var az=us-west-2a`,
`The service runs in the Tokyo region (ap-northeast-1) and the Dublin region (eu-west-1).`,
`Our app is built with React and Next.js, hosted on Vercel, and iOS builds use Apple Xcode 15.3.`,
`Switching from Jenkins to GitHub Actions; artifacts stored in Amazon S3 and Google Cloud Storage.`,
`Solve for x: 3x^2 - 12x + 9 = 0, so x = 1 or x = 3. The integral of sin(x) from 0 to pi is 2.`,
`engines: node >=18.0.0 <23, npm ^9 || ^10, python >=3.9,<3.13`,
`# Getting started

Install the CLI and run the init command.

~~~bash
npx create-app my-project
cd my-project && npm run dev
~~~

Open http://localhost:3000 in your browser.`,
`## Troubleshooting

If the build hangs, clear the cache and retry. Known issue: #1129.`,
`Error: connect ECONNREFUSED 127.0.0.1:5432
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1555:16)`,
`HTTP/1.1 429 Too Many Requests
Retry-After: 30
X-RateLimit-Remaining: 0
Content-Type: application/json`,
`ERROR 1045 (28000): Access denied for user 'root'@'localhost' (using password: YES)`,
`pytest -x tests/test_api.py::test_login_rejects_bad_password -vv`,
`ls -la /var/log
-rw-r--r--  1 root root  48213 Mar 12 10:14 syslog
drwxr-xr-x  2 root root   4096 Mar 12 09:00 nginx`,
`Latency p50=12ms p90=48ms p99=212ms; throughput 1450 req/s; error rate 0.03%.`,
`The meeting is on 2024-03-12 at 14:30 UTC. Version 3.2.1 shipped on March 12th.`,
`rate(http_requests_total{job="api",status=~"5.."}[5m]) > 0.05`,
`0 3 * * 1-5 /usr/local/bin/backup.sh --full >> /var/log/backup.log 2>&1`,
`Total: 1,234,567.89 USD; tax 7.25%; discount code SPRING24; SKU AB-1234-XY.`,
`Using Python 3.12.2, CUDA 12.1, PyTorch 2.2.1+cu121 on NVIDIA A100 80GB.`,
`GET /api/v2/orders?limit=50&offset=100&sort=-created_at HTTP/1.1`,
`gRPC status: UNAVAILABLE (14): upstream connect error, retry in 250ms`,
`The quick brown fox jumps over the lazy dog. Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
];
