import bcrypt from 'bcryptjs';
import { db, schema } from './index.js';
import { eq } from 'drizzle-orm';

async function seed() {
  console.log('Seeding database...');

  // Create default admin user
  const existingAdmin = await db.select().from(schema.users).where(eq(schema.users.email, 'admin@example.com')).get();

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('admin123', 10);
    await db.insert(schema.users).values({
      email: 'admin@example.com',
      passwordHash,
      name: 'Administrator',
      role: 'admin',
    });
    console.log('Created admin user: admin@example.com / admin123');
  }

  // Create default notification settings
  const existingSettings = await db.select().from(schema.notificationSettings).all();

  if (existingSettings.length === 0) {
    await db.insert(schema.notificationSettings).values([
      { type: 'domain', daysBefore: [30, 14, 7, 3, 1], enabled: true },
      { type: 'hosting', daysBefore: [30, 14, 7, 3, 1], enabled: true },
      { type: 'mail', daysBefore: [30, 14, 7, 3, 1], enabled: true },
    ]);
    console.log('Created default notification settings');
  }

  // Create sample mail packages
  const existingPackages = await db.select().from(schema.mailPackages).all();

  if (existingPackages.length === 0) {
    await db.insert(schema.mailPackages).values([
      {
        name: 'Basic',
        description: 'Basic mail hosting package',
        maxMailboxes: 5,
        storageGb: 5,
        price: 500,
        features: ['Webmail', 'IMAP/POP3', 'Spam filter'],
      },
      {
        name: 'Business',
        description: 'Business mail hosting package',
        maxMailboxes: 25,
        storageGb: 25,
        price: 1500,
        features: ['Webmail', 'IMAP/POP3', 'Spam filter', 'Custom domain', 'Priority support'],
      },
      {
        name: 'Enterprise',
        description: 'Enterprise mail hosting package',
        maxMailboxes: 100,
        storageGb: 100,
        price: 5000,
        features: ['Webmail', 'IMAP/POP3', 'Spam filter', 'Custom domain', 'Priority support', 'Dedicated IP', 'Advanced security'],
      },
    ]);
    console.log('Created sample mail packages');
  }

  // Create sample client and domain for testing
  const existingClients = await db.select().from(schema.clients).all();

  if (existingClients.length === 0) {
    const [client] = await db.insert(schema.clients).values({
      name: 'Test Company d.o.o.',
      email: 'info@testcompany.rs',
      phone: '+381 11 123 4567',
      address: 'Beograd, Srbija',
      notes: 'Test klijent za development',
    }).returning();

    // Add sample domain
    await db.insert(schema.domains).values({
      clientId: client.id,
      domainName: 'testcompany.rs',
      registrar: 'RNIDS',
      registrationDate: '2024-01-01',
      expiryDate: '2025-01-01',
      autoRenew: true,
      notes: 'Glavni domen klijenta',
    });

    console.log('Created sample client and domain');
  }

  // Create default email templates
  const existingTemplates = await db.select().from(schema.emailTemplates).all();

  if (existingTemplates.length === 0) {
    await db.insert(schema.emailTemplates).values([
      {
        name: 'Domain Expiry Notification',
        type: 'client',
        subject: '{{urgency}}Domen {{domainName}} ističe za {{daysUntilExpiry}} dana',
        htmlContent: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: {{urgencyColor}};">Domen uskoro ističe</h2>
  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;"><strong>Domen:</strong></td>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">{{domainName}}</td>
    </tr>
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;"><strong>Klijent:</strong></td>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">{{clientName}}</td>
    </tr>
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;"><strong>Datum isteka:</strong></td>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">{{expiryDate}}</td>
    </tr>
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;"><strong>Dana do isteka:</strong></td>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: {{urgencyColor}}; font-weight: bold;">{{daysUntilExpiry}}</td>
    </tr>
  </table>
  <p style="color: #6b7280; font-size: 14px;">Molimo vas da preduzmete odgovarajuće akcije pre isteka.</p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
  <p style="color: #9ca3af; font-size: 12px;">Ova poruka je automatski generisana od strane Hosting Panel sistema.</p>
</div>`,
        pdfTemplate: `<html>
<head><style>body{font-family:Arial,sans-serif;padding:40px;}h1{color:#1f2937;}table{width:100%;border-collapse:collapse;}td{padding:10px;border:1px solid #e5e7eb;}</style></head>
<body>
  <h1>Obaveštenje o isteku domena</h1>
  <table>
    <tr><td><strong>Domen:</strong></td><td>{{domainName}}</td></tr>
    <tr><td><strong>Klijent:</strong></td><td>{{clientName}}</td></tr>
    <tr><td><strong>Datum isteka:</strong></td><td>{{expiryDate}}</td></tr>
    <tr><td><strong>Dana do isteka:</strong></td><td>{{daysUntilExpiry}}</td></tr>
  </table>
</body>
</html>`,
        variables: ['domainName', 'clientName', 'expiryDate', 'daysUntilExpiry', 'urgency', 'urgencyColor'],
        isActive: true,
      },
      {
        name: 'Hosting Expiry Notification',
        type: 'client',
        subject: '{{urgency}}Web hosting {{hostingName}} ističe za {{daysUntilExpiry}} dana',
        htmlContent: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: {{urgencyColor}};">Web Hosting uskoro ističe</h2>
  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;"><strong>Hosting:</strong></td>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">{{hostingName}}</td>
    </tr>
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;"><strong>Klijent:</strong></td>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">{{clientName}}</td>
    </tr>
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;"><strong>Datum isteka:</strong></td>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">{{expiryDate}}</td>
    </tr>
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;"><strong>Dana do isteka:</strong></td>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: {{urgencyColor}}; font-weight: bold;">{{daysUntilExpiry}}</td>
    </tr>
  </table>
  <p style="color: #6b7280; font-size: 14px;">Molimo vas da preduzmete odgovarajuće akcije pre isteka.</p>
</div>`,
        variables: ['hostingName', 'clientName', 'expiryDate', 'daysUntilExpiry', 'urgency', 'urgencyColor'],
        isActive: true,
      },
      {
        name: 'Daily Report',
        type: 'reports',
        subject: 'Hosting Panel - Dnevni izveštaj ({{date}})',
        htmlContent: `<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
  <h1 style="color: #1f2937;">Dnevni izveštaj</h1>
  <p style="color: #6b7280;">Pregled usluga koje ističu u narednih 7 dana</p>

  <h2 style="color: #2563eb; margin-top: 30px;">Domeni ({{domainsCount}})</h2>
  {{domainsTable}}

  <h2 style="color: #2563eb; margin-top: 30px;">Web Hosting ({{hostingCount}})</h2>
  {{hostingTable}}

  <h2 style="color: #2563eb; margin-top: 30px;">Mail Hosting ({{mailCount}})</h2>
  {{mailTable}}

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
  <p style="color: #9ca3af; font-size: 12px;">Generisano: {{generatedAt}}<br>Hosting Panel</p>
</div>`,
        variables: ['date', 'domainsCount', 'domainsTable', 'hostingCount', 'hostingTable', 'mailCount', 'mailTable', 'generatedAt'],
        isActive: true,
      },
    ]);
    console.log('Created default email templates');
  }

  // Create default app settings
  const existingAppSettings = await db.select().from(schema.appSettings).all();

  if (existingAppSettings.length === 0) {
    await db.insert(schema.appSettings).values([
      { key: 'theme', value: 'light' },
      { key: 'language', value: 'sr' },
      { key: 'companyName', value: 'Hosting Panel' },
    ]);
    console.log('Created default app settings');
  }

  console.log('Seeding completed!');
}

seed().catch(console.error);
