# SolPay

SolPay is a lightweight freelance workspace for tracking projects, clients, milestones, invoices, and payment records. It can create Solana Pay requests and check for matching confirmed transfers on **Solana Devnet**.

> SolPay is a project workspace, not a payment processor. It does not custody or move funds. Devnet SOL is for testing and has no real-world value.

## Features

- Overview dashboard for project progress, upcoming deadlines, and invoice totals
- Project, client, invoice, and activity views
- Phantom wallet connection for choosing a receiving wallet
- Solana Pay request links and QR codes for unpaid invoices
- Manual Devnet transaction check with a transaction link to Solana Explorer
- Browser-local persistence using `localStorage`

## Run locally

This is a static web app; there is no build step or backend.

1. Clone or download this repository.
2. Open the project folder in a local web server, such as the VS Code Live Server extension.
3. Open the served `index.html` in your browser and allow the external Solana and QR-code scripts to load.

Phantom and a compatible Solana Pay wallet are needed for the wallet payment flow. Use the Phantom browser extension, switch it to **Devnet**, and ensure the payer has Devnet SOL. Do not use real funds.

## Request and verify a payment

1. Connect Phantom in the app; the connected wallet is used as the request recipient.
2. Open **Invoices**, select an unpaid invoice, and create a SOL payment request.
3. Have the payer open the Solana Pay link or scan the QR code with a compatible wallet, then review and approve the transaction on Devnet.
4. Return to the request and check the payment. Once a matching confirmed Devnet transfer is found, the invoice is marked paid in this browser.

Creating a request does not itself send a transaction. The payer must approve it in their wallet. Invoice and project data are stored in the current browser and are not synchronized to a server.

## Technologies

- HTML, CSS, and vanilla JavaScript
- Solana web3.js, Phantom, and Solana Devnet RPC
- QRCode.js
