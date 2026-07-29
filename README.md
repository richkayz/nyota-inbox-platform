# Nyota Inbox Platform

Build a production-ready multi-tenant web-based email platform called **Nyota Inbox**.

Nyota Inbox is NOT a mail server. It is a modern webmail and email management platform that connects to existing Plesk mail servers.

Architecture:

- Frontend: React + TypeScript + Tailwind CSS

- Backend: Node.js

- Database: PostgreSQL (application data only)

- Email: IMAP (Dovecot) for reading, SMTP (Postfix) for sending

- Do not store email messages in the application. Emails always remain on the Plesk server.

Core requirements:

1. Multi-tenant architecture.

2. Every company accesses the platform using:

   https://inbox.company.com

3. Automatically detect the hostname and load that company's branding.

4. Single login using:

   - Email Address

   - Password

5. Authenticate against the mail server and open the inbox immediately.

6. Build a modern interface that is cleaner and more intuitive than Outlook, using Nyota One branding as the default theme.

7. Mobile-first responsive design.

8. Dark and light mode.

User Roles:

SUPER ADMIN (Nyota One)

- Create companies

- Register domains

- Assign Company Admins

- Activate/Suspend companies

- Manage subscriptions

- Define licensed mailbox limits

- Reset any password

- View platform analytics

- Manage all tenants

COMPANY ADMIN

- Manage only their own company

- Reset employee passwords

- Enable/Disable users

- Manage company branding

- Manage signatures

- View mailbox usage

- Assign user roles

- Cannot create additional licensed mailboxes beyond the purchased limit

USER

- Read and send email

- Reply and forward

- Search

- Organize folders

- Manage profile

- Signature

- Vacation responder

- Theme preferences

Company Branding:

Each company must have independent:

- Logo

- Company name

- Favicon

- Primary color

- Secondary color

- Accent color

- Login background image

- Welcome message

Branding must automatically load based on the accessed hostname.

Design Goals:

- Premium SaaS appearance

- Fast

- Minimal

- Clean

- Smooth animations

- Excellent typography

- Beautiful dashboard

- Outlook functionality with a much simpler interface

Plan the project with a modular architecture so future modules such as Contacts, Calendar, Tasks, AI Assistant, Nyota Email Guard, and Shared Mailboxes can be added without redesigning the application.

Do not generate all code immediately. First design the complete architecture, database schema, folder structure, user flows, permission model, API structure, and UI wireframes. Once the architecture is approved, proceed to implementation module by module.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/38f517e8-35e4-44bc-9a9b-2532fb600f94).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
