export const mixed = [
`{
  "id": 1042,
  "name": "⟦G|Marta⟧ ⟦S|Kowalczyk⟧",
  "email": "⟦E|marta.k@example.com⟧",
  "phone": "⟦P|+48 512 345 678⟧",
  "address": {"street": "⟦ST|Polna⟧ ⟦BN|9⟧", "city": "⟦C|Kraków⟧", "zip": "⟦Z|30-001⟧"},
  "plan": "pro",
  "created_at": "2024-03-12T08:30:00Z"
}`,
`customers:
  - id: 17
    first_name: ⟦G|Derek⟧
    last_name: ⟦S|Ashford⟧
    email: ⟦E|derek.ashford@example.net⟧
    tier: gold
  - id: 18
    first_name: ⟦G|Imani⟧
    last_name: ⟦S|Cooper⟧
    email: ⟦E|imani.c@example.net⟧
    tier: silver`,
`id,name,email,country
101,⟦G|Lena⟧ ⟦S|Fischer⟧,⟦E|lena.fischer@example.de⟧,DE
102,⟦G|Tom⟧ ⟦S|Bradley⟧,⟦E|tbradley@example.com⟧,US
103,⟦G|Aiko⟧ ⟦S|Sato⟧,⟦E|aiko.sato@example.jp⟧,JP`,
`commit a1b2c3d4e5f60718293a4b5c6d7e8f9012345678
Author: ⟦G|Priya⟧ ⟦S|Natarajan⟧ <⟦E|priya.n@example.com⟧>
Date:   Mon Jan 8 16:02:11 2024 +0100

    feat(auth): add refresh token rotation

commit 0f9e8d7c6b5a40312233445566778899aabbccdd
Author: ⟦G|Luca⟧ ⟦S|Romano⟧ <⟦E|luca@example.it⟧>
Date:   Fri Jan 5 09:41:55 2024 +0100

    chore: bump deps`,
`SELECT id, name, email FROM users LIMIT 3;
 id |      name       |           email
----+-----------------+---------------------------
  1 | ⟦G|Hannah⟧ ⟦S|Berg⟧     | ⟦E|hannah.berg@example.com⟧
  2 | ⟦G|Yusuf⟧ ⟦S|Demirci⟧   | ⟦E|y.demirci@example.com⟧
(2 rows)`,
`127.0.0.1 - - [12/Mar/2024:10:14:02 +0000] "GET /health HTTP/1.1" 200 2 "-" "kube-probe/1.28"
⟦IP|203.0.113.55⟧ - ⟦E|alice.wong@example.com⟧ [12/Mar/2024:10:14:07 +0000] "POST /api/login HTTP/1.1" 401 54
⟦IP|198.51.100.9⟧ - - [12/Mar/2024:10:14:09 +0000] "GET /static/app.js HTTP/1.1" 200 10432`,
`## Support ticket #8841

**Customer:** ⟦G|Brenda⟧ ⟦S|Oyelaran⟧
**Email:** ⟦E|brenda.o@example.com⟧
**Phone:** ⟦P|+1 212 555 0147⟧

### Issue
Cannot download invoice 2024-0312. Browser: Firefox 124.

### Notes
Escalated to tier 2.`,
`# .env
DATABASE_URL=postgres://app@db.internal:5432/app
STRIPE_SECRET_KEY=⟦KEY|sk_fake_51HxxFAKEFAKEFAKEFAKE1234567890abcdef⟧
ADMIN_EMAIL=⟦E|ops-admin@example.com⟧
PORT=3000
LOG_LEVEL=debug`,
`{"event":"signup","user":{"email":"⟦E|carla.mendez@example.com⟧","name":"⟦G|Carla⟧ ⟦S|Méndez⟧","ip":"⟦IP|203.0.113.7⟧"},"ts":1710238502000}`,
`Name,DOB,SSN
⟦G|Walter⟧ ⟦S|Pruitt⟧,⟦DOB|1971-08-23⟧,⟦SSN|078-05-1120⟧
⟦G|Dolores⟧ ⟦S|Haines⟧,⟦DOB|1983-02-14⟧,⟦SSN|219-09-9999⟧`,
`2024-03-12T10:14:02Z INFO  payment.processed order=ORD-77213 amount=49.99 card=⟦CC|4111 1111 1111 1111⟧ customer=⟦E|buyer@example.com⟧ duration=214ms`,
`2024-03-12T10:15:40Z WARN  auth.failed user=⟦E|svc-admin@example.org⟧ src=⟦IP|192.0.2.88⟧ attempts=5`,
`Subject: Your order has shipped

Hi ⟦G|Nadia⟧,

Your order #55021 is on its way to:

⟦G|Nadia⟧ ⟦S|Bouchard⟧
⟦BN|88⟧ ⟦ST|Maple Avenue⟧
⟦C|Toronto⟧, ⟦STATE|ON⟧ ⟦Z|M5V 2T6⟧

Thanks!`,
`Ship to:
⟦G|Gregory⟧ ⟦S|Linton⟧
⟦BN|1420⟧ ⟦ST|Oak Street⟧ Apt 5
⟦C|Portland⟧, ⟦STATE|OR⟧ ⟦Z|97205⟧
Phone: ⟦P|(503) 555-0166⟧`,
`users:
  - login: ⟦G|jsmith⟧
    email: ⟦E|j.smith@example.com⟧
    last_ip: ⟦IP|198.51.100.23⟧
    mfa: true`,
`[2024-03-12 10:14:02] user=⟦E|olga.petrova@example.ru⟧ action=password_reset ip=⟦IP|203.0.113.200⟧ ua="Mozilla/5.0"`,
`PATCH /api/users/42 HTTP/1.1
Host: api.example.com
Content-Type: application/json

{"phone": "⟦P|+1 646 555 0123⟧", "dob": "⟦DOB|1990-04-17⟧"}`,
`Applicant: ⟦G|Nicolas⟧ ⟦S|Dubois⟧
Date of birth: ⟦DOB|03/09/1982⟧
Passport: ⟦PP|AB1234567⟧
Address: ⟦BN|12⟧ ⟦ST|Rue de la Paix⟧, ⟦Z|75002⟧ ⟦C|Paris⟧`,
`INSERT INTO patients (name, dob, ssn) VALUES ('⟦G|Helen⟧ ⟦S|Marsh⟧', '⟦DOB|1965-11-30⟧', '⟦SSN|219-09-9999⟧');`,
`[
  {"name": "⟦G|Kofi⟧ ⟦S|Asante⟧", "iban": "⟦IBAN|GB29NWBK60161331926819⟧"},
  {"name": "⟦G|Ingrid⟧ ⟦S|Solberg⟧", "iban": "⟦IBAN|DE89370400440532013000⟧"}
]`,
`| id | customer | phone | status |
|----|----------|-------|--------|
| 1 | ⟦G|Albert⟧ ⟦S|Quinn⟧ | ⟦P|+1 303 555 0111⟧ | active |
| 2 | ⟦G|Mei⟧ ⟦S|Huang⟧ | ⟦P|+1 303 555 0112⟧ | paused |`,
`Dear customer ⟦G|Sven⟧ ⟦S|Aronsson⟧,

We could not charge ⟦CC|5500 0000 0000 0004⟧. Please update your billing details at https://billing.example.com/update.

Regards,
Billing Team`,
`git shortlog -sne
    42  ⟦G|Dan⟧ ⟦S|Whitfield⟧ <⟦E|dan.whitfield@example.com⟧>
    17  ⟦G|Grace⟧ ⟦S|Osei⟧ <⟦E|grace.osei@example.com⟧>
     3  dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>`,
`Traceback (most recent call last):
  File "app/mailer.py", line 31, in send
    raise SMTPRecipientsRefused({'⟦E|bounce.test@example.com⟧': (550, b'No such user')})
smtplib.SMTPRecipientsRefused`,
`{"level":"info","msg":"user created","email":"⟦E|new.user@example.org⟧","first":"⟦G|Jonas⟧","last":"⟦S|Kreutzer⟧","id":"b3f1c2d4-8a7e-4f10-9c2b-1e2d3c4b5a69"}`,
`curl -X POST https://api.example.com/v1/charges -H "Authorization: Bearer ⟦KEY|sk-live-9f8e7d6c5b4a39281706f5e4d3c2b1a0⟧" -d email=⟦E|pay@example.com⟧ -d amount=2000`,
`Meeting notes 2024-03-12
Attendees: ⟦G|Fabian⟧, ⟦G|Soraya⟧ ⟦S|Karimi⟧, ⟦G|Dan⟧
Action: ⟦G|Fabian⟧ to email ⟦E|vendor@example.com⟧ by Friday.`,
`New hire form
Name: ⟦G|Leona⟧ ⟦S|Whitaker⟧
Start: 2024-04-01
Home address: ⟦BN|77⟧ ⟦ST|Cedar Lane⟧, ⟦C|Austin⟧, ⟦STATE|TX⟧ ⟦Z|78701⟧
Emergency contact: ⟦G|Roy⟧ ⟦S|Whitaker⟧ ⟦P|(512) 555-0188⟧`,
`Invoice INV-2024-0099
Bill to: ⟦G|Magnus⟧ ⟦S|Eklund⟧
IBAN: ⟦IBAN|SE4550000000058398257466⟧
Total: 1,240.00 EUR
Due: 2024-04-15`,
`Zendesk | Requester: ⟦E|angry.customer@example.com⟧ | Subject: refund | Priority: high | Created: 2024-03-11 22:10`,
`kubectl logs api-7d9f -n prod | grep 401
time="2024-03-12T10:14:02Z" level=warn msg="unauthorized" remote=⟦IP|203.0.113.77⟧ user=⟦E|ci-bot@example.com⟧`,
`Patient record
Name: ⟦G|Ruth⟧ ⟦S|Abernathy⟧
Age: ⟦AGE|63⟧
DOB: ⟦DOB|1960-12-02⟧
MRN: 00482913`,
`user_profile = {
    "first_name": "⟦G|Amir⟧",
    "last_name": "⟦S|Hosseini⟧",
    "email": "⟦E|amir.h@example.com⟧",
    "newsletter": True,
}`,
`Profile saved. Visit https://example.com/users/⟦G|jdoe⟧/settings?email=⟦E|john.doe@example.com⟧ to review.`,
`Reset link sent to ⟦E|mary.jones@example.com⟧: https://app.example.com/reset?token=Zm9vYmFyYmF6&email=⟦E|mary.jones@example.com⟧`,
`Delivery driver ⟦G|Kasper⟧ ⟦S|Nielsen⟧ (license ⟦DL|DK-1234567⟧) arrived at ⟦BN|5⟧ ⟦ST|Strandvejen⟧, ⟦C|Aarhus⟧.`,
`HR export:
employee,tax_id,salary
⟦G|Beatrice⟧ ⟦S|Lamont⟧,⟦TAX|52-1234567⟧,82000
⟦G|Cyrus⟧ ⟦S|Oduya⟧,⟦TAX|52-7654321⟧,76000`,
`Chat transcript
[10:02] Agent ⟦G|Tom⟧: How can I help?
[10:03] ⟦G|Julia⟧ ⟦S|Brandt⟧: my account ⟦E|julia.brandt@example.de⟧ is locked`,
`Webhook payload: {"customer":{"name":"⟦G|Oscar⟧ ⟦S|Lindholm⟧","phone":"⟦P|+46 8 123 456 78⟧"},"imei":"⟦IMEI|490154203237518⟧"}`,
`Alert: suspicious login for ⟦E|cfo@example.com⟧ from ⟦IP|2001:db8::ff00:42:8329⟧ (new device).`,
];
