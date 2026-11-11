# IDEA Printing Press ERP — Realtime Database Edition

এটি একটি **browser-only, Firebase Realtime Database (RTDB)-ভিত্তিক প্রথম ধাপের ERP build**। ব্যবসার ডেটা একটি RTDB instance-এ রাখা হবে। এই build-এ Firestore SDK, Cloud Functions, Node.js backend বা আলাদা REST API নেই। Firebase Authentication কেবল লগইন/পরিচয় যাচাইয়ের জন্য ব্যবহৃত হয়।

## ১. এই build-এ থাকা মডিউল

- Dashboard
- Master data: লোকেশন, পণ্য, হিসাব খাত, উৎপাদন BOM
- Purchase / supplier entry
- Stock, stock transfer, admin stock adjustment
- Production
- Sales delivery, settlement ও customer return
- Expense request, admin approval/payment
- Attendance: check-in/out selfie, GPS log; visible/open page-এ GPS update চেষ্টা
- Leave request ও admin approval
- Assets ও depreciation
- Journal, accounts, estimated profit/loss ও reports
- Payroll setup/process (শুধু admin)
- Workers & permissions (শুধু admin)
- JSON backup (শুধু admin)

Operational কর্মীরা তাদের নির্ধারিত লোকেশনের ব্যবসায়িক মডিউল ব্যবহার করতে পারবেন। তারা নিজেদের হাজিরা ও ছুটির তথ্য দেখবেন। Admin সব লোকেশনের তথ্য, কর্মী প্রোফাইল/সক্রিয়তা, Master Data, payroll, backup এবং সব রিপোর্ট নিয়ন্ত্রণ করবেন।

## ২. Firebase-এ Realtime Database তৈরি

1. Firebase Console খুলুন: https://console.firebase.google.com/project/ideaprintingpressnuruddi-a44ad
2. **Build → Realtime Database → Create Database** নির্বাচন করুন।
3. Location হিসেবে বাংলাদেশ-নিকটবর্তী **Singapore (`asia-southeast1`)** নির্বাচন করুন। Database instance তৈরি হওয়ার পরে location বদলানো যায় না।
4. শুরুতে **Locked mode** নির্বাচন করুন। Test mode ব্যবহার করবেন না।
5. Database তৈরি হলে Console-এ দেখানো সম্পূর্ণ **Database URL** কপি করুন। URL-এর host project ID থেকে অনুমান করবেন না। Singapore-এ URL সাধারণত `https://DATABASE_NAME.asia-southeast1.firebasedatabase.app` ধরনের হয়।
6. এই ফোল্ডারের `main.mjs` খুলে `databaseURL`-এর placeholder-এর জায়গায় আপনার কপি করা URL বসান:

```js
databaseURL: 'PASTE_EXACT_REALTIME_DATABASE_URL_FROM_FIREBASE_CONSOLE',
```

শেষে লাইনে Console-এ পাওয়া ঠিক URL থাকবে, placeholder নয়।

## ৩. নিরাপদ Security Rules বসান

Firebase Console → Realtime Database → **Rules** tab খুলুন। এই প্যাকেজের `database.rules.json` ফাইলের সম্পূর্ণ JSON কপি করে Rules editor-এ paste করে **Publish** করুন।

এই rules-এ Admin UID হিসেবে আপনার আগে দেওয়া `d9UNgMBw3bRRDEc2nSc95NF90Gg2` ব্যবহার করা হয়েছে। অন্য UID হলে `database.rules.json` এবং `main.mjs`—দুই জায়গাতেই `ADMIN_UID` পরিবর্তন করতে হবে।

Rules-এর মূল নীতি:

- ডিফল্টভাবে সব path বন্ধ।
- `members` কেবল Admin লিখতে পারবেন; কর্মী নিজের profile পড়তে পারবেন।
- `masters` সব সক্রিয় Operational কর্মী পড়তে পারবেন; কেবল Admin লিখতে পারবেন।
- Operational কর্মী শুধু নিজের লোকেশনের event পড়তে পারবেন এবং অনুমোদিত event type তৈরি করতে পারবেন। Transfer-এর destination path-এ একই transfer event-এর copy লেখার অনুমতি আছে।
- Event log append-only: পুরোনো event edit/delete করা যাবে না।
- Attendance কর্মী নিজে লিখবেন; নিজের তথ্য নিজে পড়বেন; Admin সব দেখতে পারবেন।
- Leave কর্মী নিজে আবেদন করবেন; Admin সিদ্ধান্ত update করবেন।
- Payroll branch কেবল Admin পড়তে/লিখতে পারবেন।

Firebase Rules সার্ভারেই যাচাই হয়; UI-তে button লুকানোই একমাত্র নিরাপত্তা নয়। বিস্তারিত: https://firebase.google.com/docs/database/security

## ৪. Authentication প্রস্তুত করুন

Firebase Console → **Authentication → Sign-in method**-এ গিয়ে **Email/Password** চালু আছে কি না দেখুন।

কর্মী লগইন email ফরম্যাট:

`01XXXXXXXXX@idea-press.example.com`

উদাহরণ: `017XXXXXXXX@idea-press.example.com`। Phone নম্বরটি ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর হতে হবে। Firebase Authentication → Users-এ প্রত্যেক কর্মীর account আগে তৈরি করুন; তারপর app-এর **কর্মী ও অনুমতি** মডিউলে সেই account-এর UID, নাম, location ও active status দিয়ে profile তৈরি করুন। এই app নিজে Auth account তৈরি করে না।

আপনার Admin account-এর UID আগে দেওয়া নির্দিষ্ট Admin UID-ই হতে হবে। প্রথম Admin login-এ RTDB-তে admin member record না থাকলে app সেটি তৈরি করার চেষ্টা করবে।

## ৫. GitHub Pages-এ প্রকাশ

এই ফোল্ডারের ফাইলগুলো আপনার repository root-এ upload/commit করুন:

- `index.html`
- `main.mjs`
- `database.rules.json`
- `firebase.json`
- `README-RTDB-BN.md`

GitHub repository → **Settings → Pages** → Deploy from a branch → `main` → `/(root)` নির্বাচন করে Save করুন। আপনার Pages host-টি Firebase Authentication → Settings → Authorized domains-এ যোগ করুন। এই repository owner-এর সম্ভাব্য host হলো `ideaprintingpressnuruddin-hash.github.io`; GitHub Pages-এ যে host বাস্তবে দেখায় সেটিই ব্যবহার করুন।

`firebase.json` কেবল RTDB rules deploy-এর optional Firebase CLI config। চাইলে Firebase CLI project-এ লগইন করে `firebase deploy --only database` চালাতে পারবেন। না হলে Rules tab-এ JSON paste করলেই হবে।

## ৬. প্রথমবার চালু করার ক্রম

1. Admin account দিয়ে HTTPS GitHub Pages URL-এ login করুন।
2. Dashboard থেকে **Master Data** খুলুন; প্রয়োজন হলে **প্রাথমিক মাস্টার ডেটা তৈরি** চাপুন। প্রাথমিকভাবে ঢাকা, পাকুন্দিয়া, কটিয়াদী location এবং কিছু হিসাব খাত তৈরি হবে।
3. পণ্য, একক, ক্যাটাগরি ও বিক্রয়মূল্য যোগ করুন।
4. Firebase Authentication-এ কর্মীদের account তৈরি করে Workers মডিউলে UID ও location যুক্ত করুন।
5. কর্মীদের account-এর active status নিয়ন্ত্রণ করুন। নিষ্ক্রিয় করলে তারা আর operational data access করতে পারবেন না।
6. বাস্তব লেনদেন দেওয়ার আগে একটি পরীক্ষামূলক purchase → stock → production → sales → settlement flow যাচাই করুন।

## ৭. এক Database-এর ডেটা কাঠামো

```text
/members/{uid}
/masters/{locations|products|accounts|boms}/{id}
/erp/events/{locationId}/{eventId}
/erp/attendance/{uid}/{eventId}
/erp/leaves/{uid}/{leaveId}
/erp/private/payroll/{salaries|runs}/{id}
```

এগুলো আলাদা Firebase service নয়; একই Realtime Database instance-এর path।

## ৮. পুরোনো Firestore ডেটা সম্পর্কে জরুরি কথা

এই build নতুন RTDB schema ব্যবহার করে। আগের Firestore (`shared/business`, `workers`, `attendanceEvents`) থেকে পুরোনো রেকর্ড **স্বয়ংক্রিয়ভাবে কপি বা convert করা হয়নি**। পুরোনো Firestore মুছবেন না। প্রথমে Firestore data export/backup নিতে হবে; তারপর field mapping করে RTDB schema-তে import করতে হবে। এই কাজ শেষ না হওয়া পর্যন্ত আগের Firestore data-ই পুরোনো হিসাবের মূল রেকর্ড হিসেবে রেখে দিন।

## ৯. Free plan-এর সীমা ও অপারেশনাল সতর্কতা

Firebase-এর বর্তমান Spark no-cost quota-তে RTDB storage **1 GB**, download **10 GB/month**, simultaneous connection **100**। Spark quota অতিক্রম করলে Firebase অতিরিক্ত টাকা না কেটে resource বন্ধ করে দেয়; সে সময় app-এর database traffic বন্ধ হতে পারে। Usage Console-এর Realtime Database → Usage tab-এ নিয়মিত দেখুন। Source: https://firebase.google.com/docs/database/usage/billing এবং https://firebase.google.com/docs/database/usage/limits

এই build-এ হাজিরার selfie ছোট করে base64 আকারে RTDB-তে রাখা হয়, তাই ছবি অনেক জমলে storage ও download দ্রুত বাড়তে পারে। Backup JSON-এ selfie ও GPS data থাকতে পারে—ফাইলটি ব্যক্তিগত ও নিরাপদ জায়গায় রাখুন।

**GPS সীমা:** ওয়েব পেজ বন্ধ বা background-এ থাকলে নির্ভরযোগ্য ৩০ মিনিট অন্তর tracking নিশ্চিত করা যায় না। এই app page visible/open থাকা অবস্থায় timer দিয়ে GPS update চেষ্টা করে; browser permission, device setting ও network-এর ওপরও নির্ভর করে।

**হিসাবের সীমা:** লাভ-ক্ষতি বর্তমানে management estimate; পূর্ণাঙ্গ audited accounting নয়। Opening balance, receivable/payable aging, tax, payroll cost, depreciation policy, discount, bad debt, return adjustment, cash/bank reconciliation ইত্যাদি এখনো সম্পূর্ণ accounting workflow নয়। Client-side checks ব্যবহারকারীর browser-এ চলে; RTDB Rules role, location, ownership, schema এবং append-only constraints enforce করে, কিন্তু প্রতিটি হিসাবের business correctness বা cross-event stock balance server-side হিসাব করে নিশ্চিত করে না। বাস্তব হিসাব ব্যবহারের আগে নমুনা ডেটা দিয়ে যাচাই ও নিয়মিত backup আবশ্যক।

## ১০. Production status

এটি চালু করার উপযোগী **RTDB migration starter / Phase-1 operational build**, কিন্তু আপনার Firebase Console-এ database instance তৈরি, সঠিক database URL বসানো, rules publish, Authentication domain authorize এবং বাস্তব account দিয়ে end-to-end test না হওয়া পর্যন্ত একে production-verified বলা যাবে না। কোনো Firebase resource এখানে আপনার হয়ে তৈরি বা deploy করা হয়নি।
