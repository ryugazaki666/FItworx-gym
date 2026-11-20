// server/seed.js
// Populates the database with a starter admin/staff account and sample
// plans/members/walk-ins/payments/attendance so the system can be demoed
// and tested end-to-end. Safe to re-run: it only inserts if tables are empty.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { db, nextMemberId, nextWalkinId, nextPaymentId, refreshMemberStatuses } from "./db.js";

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function seedSettings() {
  const count = db.prepare("SELECT COUNT(*) AS c FROM settings").get().c;
  if (count > 0) return;
  const insert = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
  insert.run("gym_name", "FitWorx Fitness Center — QC Branch");
  insert.run("contact_email", "frontdesk@fitworx.gym");
  insert.run("operating_hours", "5:00 AM – 10:00 PM, Daily");
  console.log("Seeded gym profile settings.");
}

function seedUsers() {
  const count = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (count > 0) return;
  const insert = db.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
  );
  insert.run("Clyde Fabricante", "admin@fitworx.gym", bcrypt.hashSync("Admin123!", 10), "admin");
  insert.run("Staff", "staff@fitworx.gym", bcrypt.hashSync("Staff123!", 10), "staff");
  console.log("Seeded users: admin@fitworx.gym / Admin123!, staff@fitworx.gym / Staff123!");
}

function seedPlans() {
  const count = db.prepare("SELECT COUNT(*) AS c FROM plans").get().c;
  if (count > 0) return;
  const insert = db.prepare(
    "INSERT INTO plans (name, price, duration_days, description, active) VALUES (?, ?, ?, ?, 1)"
  );
  insert.run("1 Month", 1000, 30, "Most popular plan");
  insert.run("3 Months", 2500, 90, "Quarterly savings");
  insert.run("6 Months", 4500, 180, "Best for regulars");
  insert.run("Annual", 8000, 365, "Lowest effective monthly rate");
  console.log("Seeded membership plans.");
}

function seedMembers() {
  const count = db.prepare("SELECT COUNT(*) AS c FROM members").get().c;
  if (count > 0) return;
  const planByName = Object.fromEntries(
    db.prepare("SELECT id, name FROM plans").all().map((p) => [p.name, p.id])
  );
  const insert = db.prepare(`
    INSERT INTO members (
      id, first_name, last_name, dob, gender, phone, email, address,
      emergency_name, emergency_relationship, emergency_phone,
      plan_id, status, start_date, expiration_date, joined_date, qr_token
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const sample = [
    { first: "Errol", last: "Dela Pena", dob: "1994-05-03", gender: "Male", phone: "0917 123 4567", email: "errol.delapena@mail.com", addr: "14 Kalayaan Ave, Quezon City", plan: "Monthly", startOffset: -7, joined: -400 },
    { first: "Ian", last: "De Borja", dob: "1990-11-02", gender: "Male", phone: "0919 555 7788", email: "ian.deborja@mail.com", addr: "22 Rizal Blvd, Pasig", plan: "3 Months", startOffset: -85, joined: -85 },
    { first: "Cyrill", last: "Pascua", dob: "1996-09-14", gender: "Male", phone: "0921 333 4455", email: "cyrill.pascua@mail.com", addr: "31 Aguinaldo Hwy, Cavite", plan: "6 Months", startOffset: -194, joined: -194 },
    { first: "Lebron", last: "James", dob: "1993-04-22", gender: "Male", phone: "0922 111 9900", email: "lebron.james@mail.com", addr: "9 Del Pilar St, Taguig", plan: "Monthly", startOffset: -40, joined: -600, suspended: true },
    { first: "Querubin", last: "Jacob", dob: "1998-01-19", gender: "Male", phone: "0918 222 3344", email: "querubin.jacob@mail.com", addr: "88 Mabini St, Manila", plan: "Annual", startOffset: 0, joined: 0 },
    { first: "Stephen", last: "Curry", dob: "1995-06-10", gender: "Male", phone: "0920 444 1122", email: "stephen.curry@mail.com", addr: "5 Bonifacio St, Makati", plan: "Monthly", startOffset: -3, joined: -3 },
    { first: "Kyrie", last: "Irving", dob: "1992-03-08", gender: "Male", phone: "0917 888 2211", email: "kyrie.irving@mail.com", addr: "17 Katipunan Ave, QC", plan: "Annual", startOffset: -100, joined: -100 },
    { first: "Dwight", last: "Ramos", dob: "1999-12-25", gender: "Male", phone: "0919 777 3344", email: "dwight.ramos@mail.com", addr: "3 EDSA, Mandaluyong", plan: "Monthly", startOffset: -29, joined: -29 },
  ];

  const created = [];
  for (const m of sample) {
    const planId = planByName[m.plan];
    const durationRow = db.prepare("SELECT duration_days FROM plans WHERE id = ?").get(planId);
    const start = daysFromNow(m.startOffset);
    const exp = daysFromNow(m.startOffset + durationRow.duration_days);
    const id = nextMemberId();
    const status = m.suspended ? "suspended" : "active";
    insert.run(
      id, m.first, m.last, m.dob, m.gender, m.phone, m.email, m.addr,
      null, null, null,
      planId, status, start, exp, daysFromNow(m.joined), randomUUID()
    );
    created.push({ id, planId, ...m });
  }
  console.log(`Seeded ${created.length} members.`);
  return created;
}

function seedWalkins() {
  const count = db.prepare("SELECT COUNT(*) AS c FROM walkins").get().c;
  if (count > 0) return;
  const insert = db.prepare(`
    INSERT INTO walkins (id, name, phone, service, amount, payment_method, visit_date, visit_time, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const rows = [
    { name: "Rico Santos", phone: "0918 999 1234", service: "Day Pass", amount: 150, method: "Cash", date: daysFromNow(0), time: "10:30", status: "completed", notes: "Drop-in cardio session" },
    { name: "Ari Mercado", phone: "0917 222 8899", service: "Day Pass", amount: 150, method: "GCash", date: daysFromNow(-1), time: "18:15", status: "completed", notes: "Strength training day pass" },
    { name: "Nina Castillo", phone: "0920 555 6677", service: "Guest Pass", amount: 200, method: "GCash", date: daysFromNow(-2), time: "09:45", status: "pending", notes: "Awaiting payment confirmation" },
  ];
  for (const w of rows) {
    insert.run(nextWalkinId(), w.name, w.phone, w.service, w.amount, w.method, w.date, w.time, w.status, w.notes);
  }
  console.log(`Seeded ${rows.length} walk-in records.`);
}

function seedPaymentsAndAttendance(members) {
  const count = db.prepare("SELECT COUNT(*) AS c FROM payments").get().c;
  if (count > 0 || !members) return;

  const payInsert = db.prepare(`
    INSERT INTO payments (id, member_id, walkin_id, type, plan_id, amount, method, reference_number, status, paid_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
  `);
  const attInsert = db.prepare(`
    INSERT INTO attendance (member_id, walkin_id, check_in, check_out, source)
    VALUES (?, NULL, ?, ?, 'manual')
  `);
  const priceByPlan = Object.fromEntries(
    db.prepare("SELECT id, price FROM plans").all().map((p) => [p.id, p.price])
  );
  const methods = ["Cash", "GCash"];

  let paid = 0, visits = 0;
  for (const m of members) {
    payInsert.run(
      nextPaymentId(), m.id, "membership", m.planId, priceByPlan[m.planId],
      methods[Math.floor(Math.random() * methods.length)],
      null, "paid", `${daysFromNow(m.startOffset)} 09:00:00`
    );
    paid++;

    // A few historical visits per member, spread over the past two weeks.
    const visitCount = 2 + Math.floor(Math.random() * 5);
    for (let i = 0; i < visitCount; i++) {
      const offset = -Math.floor(Math.random() * 14);
      const hour = 6 + Math.floor(Math.random() * 12);
      const checkIn = `${daysFromNow(offset)} ${String(hour).padStart(2, "0")}:00:00`;
      const checkOut = `${daysFromNow(offset)} ${String(hour + 1).padStart(2, "0")}:15:00`;
      attInsert.run(m.id, checkIn, checkOut);
      visits++;
    }
  }

  // Walk-in payments mirror walkins table for financial reporting completeness.
  const walkins = db.prepare("SELECT * FROM walkins").all();
  const wpInsert = db.prepare(`
    INSERT INTO payments (id, member_id, walkin_id, type, plan_id, amount, method, reference_number, status, paid_at)
    VALUES (?, NULL, ?, 'walk_in', NULL, ?, ?, NULL, ?, ?)
  `);
  for (const w of walkins) {
    wpInsert.run(nextPaymentId(), w.id, w.amount, w.payment_method, w.status === "completed" ? "paid" : "pending", `${w.visit_date} ${w.visit_time}:00`);
  }

  console.log(`Seeded ${paid} membership payments, ${walkins.length} walk-in payments, ${visits} attendance records.`);
}

seedSettings();
seedUsers();
seedPlans();
const members = seedMembers();
seedWalkins();
seedPaymentsAndAttendance(members);
refreshMemberStatuses();
console.log("Seed complete.");
