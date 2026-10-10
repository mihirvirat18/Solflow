(() => {
  "use strict";

  const STORAGE_KEY = "solflow-nepal-workspace-v1";
  const SOLANA_DEVNET_RPC = "https://api.devnet.solana.com";
  const LAMPORTS_PER_SOL = 1_000_000_000;
  const SOL_PAYMENT_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
  const today = new Date();
  const day = (offset) => {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  const initialState = {
    projects: [
      {
        id: "prj-brand", name: "Brand identity & guidelines", client: "Northstar Studio", amount: 3200, due: day(8),
        milestones: [
          { id: "m-brand-1", name: "Creative direction & moodboards", status: "approved" },
          { id: "m-brand-2", name: "Logo concepts", status: "submitted" },
          { id: "m-brand-3", name: "Final brand guidelines", status: "pending" }
        ]
      },
      {
        id: "prj-site", name: "E-commerce website build", client: "Morrow Goods", amount: 5800, due: day(19),
        milestones: [
          { id: "m-site-1", name: "Wireframes & sitemap", status: "approved" },
          { id: "m-site-2", name: "Storefront development", status: "in_progress" },
          { id: "m-site-3", name: "QA & handoff", status: "pending" }
        ]
      },
      {
        id: "prj-content", name: "Product launch content", client: "Goodland Co.", amount: 1450, due: day(-4),
        milestones: [
          { id: "m-content-1", name: "Content plan", status: "approved" },
          { id: "m-content-2", name: "Launch copy & assets", status: "approved" }
        ]
      },
      {
        id: "prj-brand-refresh", name: "Visual identity refresh", client: "Atelier 06", amount: 2100, due: day(26),
        milestones: [
          { id: "m-refresh-1", name: "Discovery workshop", status: "pending" },
          { id: "m-refresh-2", name: "Identity system", status: "pending" }
        ]
      }
    ],
    invoices: [
      { id: "INV-2026-008", projectId: "prj-content", amount: 1450, issued: day(-14), paymentStatus: "paid", verification: "provider", memo: "Final delivery" },
      { id: "INV-2026-009", projectId: "prj-brand", amount: 1280, issued: day(-3), paymentStatus: "outstanding", verification: null, memo: "Logo concepts" },
      { id: "INV-2026-010", projectId: "prj-site", amount: 2320, issued: day(-1), paymentStatus: "processing", verification: "client", memo: "Storefront development" }
    ],
    activity: [
      { id: "act-1", text: "Milestone approved for", subject: "Product launch content", date: day(-1) },
      { id: "act-2", text: "Invoice issued for", subject: "E-commerce website build", date: day(-1) },
      { id: "act-3", text: "Work submitted for", subject: "Brand identity & guidelines", date: day(-2) },
      { id: "act-4", text: "Project created:", subject: "Visual identity refresh", date: day(-4) }
    ]
  };

  let state = loadState();
  let currentPage = "overview";
  let openProjectId = null;
  let currentInvoiceId = null;
  let currentSolInvoiceId = null;
  let connectedWallet = null;
  let checkingSolPayment = false;
  let toastTimer = null;

  const view = document.getElementById("view-container");
  const modal = document.getElementById("modal-backdrop");
  const invoiceModal = document.getElementById("invoice-modal-backdrop");
  const solPaymentModal = document.getElementById("sol-payment-modal-backdrop");
  const projectForm = document.getElementById("project-form");
  const invoiceForm = document.getElementById("invoice-update-form");
  const solPaymentForm = document.getElementById("sol-payment-form");
  const toast = document.getElementById("toast");
  const pageTitles = { overview: "Overview", projects: "Projects", clients: "Clients", invoices: "Invoices", activity: "Activity" };

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return structuredClone(initialState);
      const parsed = JSON.parse(saved);
      if (!parsed || !Array.isArray(parsed.projects) || !Array.isArray(parsed.invoices) || !Array.isArray(parsed.activity)) {
        throw new Error("Saved workspace data has an invalid shape.");
      }
      return parsed;
    } catch (error) {
      console.error("Could not load saved SolFlow workspace data.", error);
      return structuredClone(initialState);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("Could not save SolFlow workspace data.", error);
      showToast("Could not save changes in this browser.");
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function setAccountAvatarInitials() {
    const accountName = document.querySelector(".profile-button .workspace-copy strong").textContent.trim();
    const nameParts = accountName.split(/\s+/);
    const initials = nameParts.length > 1
      ? `${Array.from(nameParts[0])[0]}${Array.from(nameParts[nameParts.length - 1])[0]}`
      : Array.from(nameParts[0])[0];
    document.querySelectorAll("[data-account-avatar]").forEach((avatar) => {
      avatar.textContent = initials.toUpperCase();
    });
  }

  function money(value) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
  }

  function formatDate(value, options = { month: "short", day: "numeric" }) {
    if (!value) return "Not set";
    const date = new Date(`${value}T12:00:00`);
    return new Intl.DateTimeFormat("en-US", options).format(date);
  }

  function projectStatus(project) {
    if (project.milestones.some((milestone) => milestone.status === "submitted")) return "Awaiting approval";
    if (project.milestones.every((milestone) => milestone.status === "approved")) return "Complete";
    if (project.milestones.some((milestone) => milestone.status === "in_progress" || milestone.status === "approved")) return "In progress";
    return "Ready to start";
  }

  function statusClass(status) {
    return {
      "Awaiting approval": "status-awaiting-approval",
      "In progress": "status-in-progress",
      "Ready to start": "status-ready-to-start",
      "Complete": "status-paid",
      "Outstanding": "status-outstanding",
      "Processing": "status-processing",
      "Paid": "status-paid"
    }[status] || "status-ready-to-start";
  }

  function paymentStatusLabel(invoice) {
    if (invoice.paymentStatus === "paid") return "Paid";
    if (invoice.paymentStatus === "processing") return "Processing";
    return "Outstanding";
  }

  function invoiceVerification(invoice) {
    if (invoice.paymentStatus === "paid" && invoice.verification === "solana_devnet") {
      const transactionLink = invoice.solanaSignature
        ? `<a class="solana-explorer-link" href="https://explorer.solana.com/tx/${encodeURIComponent(invoice.solanaSignature)}?cluster=devnet" target="_blank" rel="noopener noreferrer">View transaction ↗</a>`
        : "";
      return `<span class="invoice-tag confirmed">✓ Devnet confirmed</span>${transactionLink}`;
    }
    if (invoice.paymentStatus === "paid" && invoice.verification === "provider") {
      return '<span class="invoice-tag confirmed">✓ Provider confirmed</span>';
    }
    if (invoice.paymentStatus === "processing" && invoice.verification === "client") {
      return '<span class="invoice-tag reported">◷ Client reported</span>';
    }
    return '<span class="invoice-tag not-received">○ Not confirmed</span>';
  }

  function solPaymentButton(invoice) {
    if (invoice.paymentStatus === "paid") return "";
    return `<button class="table-action" data-sol-payment="${escapeHtml(invoice.id)}">${invoice.solPayment ? "View SOL request" : "Request SOL"}</button>`;
  }

  function bindSolPaymentActions() {
    view.querySelectorAll("[data-sol-payment]").forEach((button) => {
      button.addEventListener("click", () => openSolPaymentDialog(button.dataset.solPayment));
    });
  }

  function walletProvider() {
    if (window.phantom && window.phantom.solana) return window.phantom.solana;
    if (window.solana && window.solana.isPhantom) return window.solana;
    return null;
  }

  function setWalletStatus(publicKey) {
    connectedWallet = publicKey ? publicKey.toString() : null;
    const button = document.getElementById("wallet-button");
    if (!button) return;
    button.textContent = connectedWallet
      ? `${connectedWallet.slice(0, 4)}…${connectedWallet.slice(-4)} · Disconnect`
      : "Connect Phantom";
    button.title = connectedWallet || "Connect a Phantom wallet on Solana Devnet";
    button.setAttribute("aria-label", connectedWallet ? `Disconnect wallet ${connectedWallet}` : "Connect Phantom wallet");
  }

  function initializeWallet() {
    const provider = walletProvider();
    if (!provider) return;
    if (provider.isConnected && provider.publicKey) setWalletStatus(provider.publicKey);
    provider.on("connect", (publicKey) => setWalletStatus(publicKey || provider.publicKey));
    provider.on("accountChanged", (publicKey) => setWalletStatus(publicKey));
    provider.on("disconnect", () => setWalletStatus(null));
  }

  function solToLamports(value) {
    const normalized = String(value).trim();
    if (!/^\d+(?:\.\d{1,9})?$/.test(normalized)) {
      throw new Error("Enter a positive SOL amount with no more than 9 decimal places.");
    }
    const [whole, fraction = ""] = normalized.split(".");
    const lamports = BigInt(whole) * BigInt(LAMPORTS_PER_SOL) + BigInt(fraction.padEnd(9, "0") || "0");
    if (lamports <= 0n || lamports > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Enter a SOL amount greater than zero and within the supported range.");
    }
    return lamports;
  }

  function solPaymentUri(payment) {
    const params = new URLSearchParams({
      amount: payment.amount,
      reference: payment.reference,
      label: "SolFlow",
      message: `Invoice ${payment.invoiceId}`,
      cluster: "devnet"
    });
    return `solana:${payment.recipient}?${params.toString()}`;
  }

  function solPaymentRequestExpired(payment) {
    const expiresAt = Date.parse(payment.expiresAt || "");
    return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
  }

  function transactionIncludesReference(transaction, reference) {
    const accountKeys = transaction.transaction.message.accountKeys;
    return Array.isArray(accountKeys) && accountKeys.some((accountKey) => {
      const publicKey = accountKey.pubkey || accountKey;
      return publicKey.toString() === reference;
    });
  }

  function transactionHasMatchingTransfer(transaction, payment, expectedLamports) {
    return transaction.transaction.message.instructions.some((instruction) => {
      const info = instruction.parsed && instruction.parsed.info;
      if (!instruction.parsed || instruction.program !== "system" || instruction.parsed.type !== "transfer" || !info) return false;
      try {
        return info.destination === payment.recipient && BigInt(String(info.lamports)) === expectedLamports;
      } catch {
        return false;
      }
    });
  }

  function isConfirmedSignatureStatus(status) {
    return Boolean(status && !status.err && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized"));
  }

  function signatureAlreadyApplied(invoices, invoiceId, signature) {
    return invoices.some((invoice) => invoice.id !== invoiceId && invoice.solanaSignature === signature);
  }

  function showSolPaymentRequest(invoice) {
    const payment = invoice.solPayment;
    const requestPanel = document.getElementById("sol-payment-request");
    const amountInput = document.getElementById("sol-payment-amount");
    const createButton = document.getElementById("create-sol-payment-request");
    const status = document.getElementById("sol-payment-status");
    const uri = solPaymentUri({ ...payment, invoiceId: invoice.id });
    amountInput.value = payment.amount;
    amountInput.disabled = true;
    createButton.hidden = true;
    requestPanel.hidden = false;
    document.getElementById("sol-payment-uri").value = uri;
    document.getElementById("sol-payment-recipient").textContent = `Receiving wallet: ${payment.recipient}`;
    const expired = solPaymentRequestExpired(payment);
    status.textContent = expired
      ? "This payment request has expired. Create a replacement request before accepting payment."
      : `Waiting for a matching confirmed Devnet transfer. Request expires ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(payment.expiresAt))}.`;
    document.getElementById("replace-sol-payment-request").hidden = !expired;
    document.getElementById("check-sol-payment").disabled = expired;
    const qr = document.getElementById("sol-payment-qr");
    qr.replaceChildren();
    if (typeof window.QRCode !== "function") {
      status.textContent = "QR generator failed to load. Copy the Solana Pay link instead.";
      return;
    }
    new window.QRCode(qr, { text: uri, width: 192, height: 192, correctLevel: window.QRCode.CorrectLevel.M });
  }

  function projectRow(project, includeDue = true) {
    const status = projectStatus(project);
    return `<tr>
      <td><span class="project-name">${escapeHtml(project.name)}</span><span class="project-client">${escapeHtml(project.client)}</span></td>
      <td><span class="project-amount">${money(project.amount)}</span></td>
      ${includeDue ? `<td><span class="date-text">${formatDate(project.due)}</span></td>` : ""}
      <td><span class="status-pill ${statusClass(status)}">${status}</span></td>
      <td><button class="table-action" data-open-project="${escapeHtml(project.id)}">View project →</button></td>
    </tr>`;
  }

  function projectTable(projects, includeDue = true) {
    if (!projects.length) {
      return `<div class="empty-state"><strong>No projects yet</strong>Your project workspace starts with one clear brief.<br><button class="button button-primary button-small" data-action="new-project">Create a project</button></div>`;
    }
    return `<div class="table-wrap"><table class="project-table"><thead><tr>
      <th>PROJECT</th><th>VALUE</th>${includeDue ? "<th>DUE DATE</th>" : ""}<th>STATUS</th><th></th>
      </tr></thead><tbody>${projects.map((project) => projectRow(project, includeDue)).join("")}</tbody></table></div>`;
  }

  function projectForInvoice(invoice) {
    return state.projects.find((project) => project.id === invoice.projectId);
  }

  function nextInvoiceId() {
    const sequence = state.invoices.reduce((highest, invoice) => {
      const match = invoice.id.match(/-(\d+)$/);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0) + 1;
    return `INV-${today.getFullYear()}-${String(sequence).padStart(3, "0")}`;
  }

  function invoiceItem(invoice) {
    const project = projectForInvoice(invoice);
    return `<div class="invoice-item">
      <div class="invoice-copy"><strong>${escapeHtml(project ? project.name : "Project invoice")}</strong><small>${escapeHtml(invoice.id)} · ${formatDate(invoice.issued)}</small></div>
      <div><span class="invoice-amount">${money(invoice.amount)}</span>${invoiceVerification(invoice)}</div>
    </div>`;
  }

  function activityItem(item) {
    return `<div class="activity-item"><span class="activity-marker"></span><div class="activity-copy">${escapeHtml(item.text)} <strong>${escapeHtml(item.subject)}</strong><small>${formatDate(item.date, { month: "short", day: "numeric", year: "numeric" })}</small></div></div>`;
  }

  function pipelineMarkup() {
    const previewProjects = [...state.projects].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 3);
    return `<div class="pipeline-list">${previewProjects.map((project) => {
      const totalMilestones = project.milestones.length || 1;
      const done = project.milestones.filter((milestone) => milestone.status === "approved").length;
      const progress = Math.round((done / totalMilestones) * 100);
      return `<div class="pipeline-item">
        <div class="pipeline-row">
          <div>
            <strong>${escapeHtml(project.name)}</strong>
            <small>${escapeHtml(project.client)}</small>
          </div>
          <span class="status-pill ${statusClass(projectStatus(project))}">${projectStatus(project)}</span>
        </div>
        <div class="progress-meta"><span>${done}/${totalMilestones} milestones</span><span>${progress}%</span></div>
        <div class="progress-bar"><span style="width: ${progress}%"></span></div>
        <div class="pipeline-footer"><span>Due ${formatDate(project.due, { month: "short", day: "numeric" })}</span><span>${money(project.amount)}</span></div>
      </div>`;
    }).join("")}</div>`;
  }

  function forecastMarkup() {
    const values = [42, 58, 76, 92];
    const labels = ["Jan", "Feb", "Mar", "Apr"];
    return `<div class="revenue-card">
      <div class="revenue-head"><span>Projected monthly revenue</span><strong>${money(state.projects.reduce((sum, project) => sum + Number(project.amount), 0))}</strong></div>
      <div class="revenue-bars">${values.map((value, index) => `<div class="bar-column"><span class="bar" style="height: ${value}%"></span><small>${labels[index]}</small></div>`).join("")}</div>
    </div>`;
  }

  function upcomingRemindersMarkup() {
    const reminders = [...state.projects].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 3).map((project) => {
      const nextMilestone = project.milestones.find((milestone) => milestone.status !== "approved");
      return `<div class="reminder-item">
        <div class="reminder-dot"></div>
        <div>
          <strong>${escapeHtml(project.name)}</strong>
          <small>${nextMilestone ? escapeHtml(nextMilestone.name) : "All milestones approved"}</small>
        </div>
        <span>${formatDate(project.due, { month: "short", day: "numeric" })}</span>
      </div>`;
    });
    return reminders.length ? reminders.join("") : '<div class="empty-state">No urgent deadlines right now.</div>';
  }

  function statsMarkup() {
    const activeProjects = state.projects.filter((project) => !["Complete"].includes(projectStatus(project))).length;
    const outstanding = state.invoices.filter((invoice) => invoice.paymentStatus !== "paid").reduce((sum, invoice) => sum + Number(invoice.amount), 0);
    const confirmed = state.invoices.filter((invoice) => invoice.paymentStatus === "paid" && invoice.verification === "provider").reduce((sum, invoice) => sum + Number(invoice.amount), 0);
    const approvals = state.projects.reduce((sum, project) => sum + project.milestones.filter((milestone) => milestone.status === "submitted").length, 0);
    const dueSoon = state.projects.filter((project) => {
      const diff = new Date(`${project.due}T12:00:00`).getTime() - new Date().getTime();
      return diff > 0 && diff <= 1000 * 60 * 60 * 24 * 30;
    }).length;
    const stats = [
      { label: "Active projects", value: activeProjects, icon: "▤", foot: "Across your workspace" },
      { label: "Due soon", value: dueSoon, icon: "◔", foot: dueSoon ? "Next 30 days" : "No imminent deadlines" },
      { label: "Outstanding", value: money(outstanding), icon: "↗", foot: "Open payment records" },
      { label: "Verified", value: money(confirmed), icon: "✓", foot: "Provider confirmed" }
    ];
    return `<section class="stats-grid" aria-label="Workspace summary">${stats.map((item) => `<article class="stat-card"><div class="stat-top"><span>${item.label}</span><span class="stat-icon">${item.icon}</span></div><strong class="stat-value">${item.value}</strong><div class="stat-foot">${item.foot}</div></article>`).join("")}</section>`;
  }

  function overviewMarkup() {
    const projects = [...state.projects].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 4);
    const invoices = [...state.invoices].sort((a, b) => b.issued.localeCompare(a.issued)).slice(0, 3);
    return `${statsMarkup()}
      <section class="action-strip" aria-label="Quick actions">
        <div>
          <p class="eyebrow">QUICK ACTIONS</p>
          <h2 class="action-title">Keep momentum on your freelance pipeline.</h2>
        </div>
        <div class="action-buttons">
          <button class="chip-button primary" data-action="new-project">New project</button>
          <button class="chip-button" data-page="projects">Review pipeline</button>
          <button class="chip-button" data-page="invoices">Open invoices</button>
          <button class="chip-button" data-page="activity">View activity</button>
        </div>
      </section>
      <div class="dashboard-grid">
        <section class="panel panel-featured">
          <div class="panel-header"><div><h2 class="panel-title">Project pipeline</h2><p class="panel-subtitle">Milestone health and upcoming delivery dates.</p></div><button class="text-button" data-page="projects">All projects →</button></div>
          ${pipelineMarkup()}
        </section>
        <div class="right-column">
          <section class="panel">
            <div class="panel-header"><div><h2 class="panel-title">Revenue overview</h2><p class="panel-subtitle">Projected value across your active pipeline.</p></div><button class="text-button" data-page="invoices">View records</button></div>
            ${forecastMarkup()}
          </section>
          <section class="panel">
            <div class="panel-header"><div><h2 class="panel-title">Upcoming deadlines</h2><p class="panel-subtitle">Keep client work moving forward.</p></div></div>
            <div class="reminder-list">${upcomingRemindersMarkup()}</div>
          </section>
          <section class="panel">
            <div class="panel-header"><div><h2 class="panel-title">Recent invoices</h2><p class="panel-subtitle">Payment records, all in one place.</p></div><button class="text-button" data-page="invoices">View all</button></div>
            <div class="invoice-list">${invoices.length ? invoices.map(invoiceItem).join("") : '<div class="empty-state">Invoices you create will show here.</div>'}</div>
          </section>
          <aside class="partner-note"><div class="partner-note-title"><span>✓</span> Payment clarity, built in</div><p>Devnet SOL requests send test tokens directly to your connected wallet. SolFlow never holds funds; use your approved provider for live payments.</p></aside>
          <section class="panel">
            <div class="panel-header"><div><h2 class="panel-title">Recent activity</h2><p class="panel-subtitle">The latest project updates.</p></div><button class="text-button" data-page="activity">See all</button></div>
            <div class="activity-list">${state.activity.slice(0, 3).map(activityItem).join("") || '<div class="empty-state">Project updates will appear here.</div>'}</div>
          </section>
        </div>
      </div>`;
  }

  function projectsMarkup() {
    return `<div class="page-toolbar"><label class="search-box"><input class="search-input" id="project-search" type="search" placeholder="Search projects" aria-label="Search projects"></label>
      <select class="filter-select" id="project-filter" aria-label="Filter projects"><option value="all">All statuses</option><option>In progress</option><option>Awaiting approval</option><option>Ready to start</option><option>Complete</option></select></div>
      <section class="panel"><div class="panel-header"><div><h2 class="panel-title">All projects</h2><p class="panel-subtitle">${state.projects.length} project${state.projects.length === 1 ? "" : "s"} in your workspace</p></div></div><div id="projects-table">${projectTable([...state.projects].sort((a, b) => a.due.localeCompare(b.due)))}</div></section>`;
  }

  function invoicesMarkup() {
    const rows = [...state.invoices].sort((a, b) => b.issued.localeCompare(a.issued)).map((invoice) => {
      const project = projectForInvoice(invoice);
      const label = paymentStatusLabel(invoice);
      return `<tr><td><span class="invoice-id">${escapeHtml(invoice.id)}</span></td>
        <td><span class="project-name">${escapeHtml(project ? project.name : "Project invoice")}</span><span class="project-client">${escapeHtml(project ? project.client : "Project archived")}</span></td>
        <td><span class="project-amount">${money(invoice.amount)}</span></td>
        <td><span class="date-text">${formatDate(invoice.issued)}</span></td>
        <td><span class="status-pill ${statusClass(label)}">${label}</span><br>${invoiceVerification(invoice)}</td>
        <td>${solPaymentButton(invoice)}<button class="table-action" data-invoice-action="${escapeHtml(invoice.id)}">${invoice.paymentStatus === "paid" ? "View record" : "Update record"}</button></td></tr>`;
    }).join("");
    return `<div class="page-toolbar"><label class="search-box"><input class="search-input" id="invoice-search" type="search" placeholder="Search invoices or clients" aria-label="Search invoices or clients"></label>
      <select class="filter-select" id="invoice-filter" aria-label="Filter invoices"><option value="all">All statuses</option><option value="outstanding">Outstanding</option><option value="processing">Processing</option><option value="paid">Paid</option></select></div>
      <section class="panel"><div class="panel-header"><div><h2 class="panel-title">Invoices & payment records</h2><p class="panel-subtitle">Create Devnet SOL requests or record provider-confirmed payments.</p></div></div>
      <div id="invoice-table-container">${rows ? `<div class="listing-table-wrap"><table class="project-table listing-table"><thead><tr><th>INVOICE</th><th>PROJECT</th><th>AMOUNT</th><th>ISSUED</th><th>PAYMENT STATUS</th><th></th></tr></thead><tbody id="invoice-rows">${rows}</tbody></table></div>` : '<div class="empty-state"><strong>No invoices yet</strong>Create a project to start organizing your payment records.</div>'}</div></section>`;
  }

  function clientsMarkup() {
    const clientMap = new Map();
    state.projects.forEach((project) => {
      const key = project.client;
      if (!clientMap.has(key)) {
        clientMap.set(key, { client: key, projects: [], total: 0, latest: project.due });
      }
      clientMap.get(key).projects.push(project);
      clientMap.get(key).total += Number(project.amount);
      clientMap.get(key).latest = clientMap.get(key).latest > project.due ? clientMap.get(key).latest : project.due;
    });
    const clients = [...clientMap.values()].sort((a, b) => b.total - a.total);
    return `<div class="page-toolbar"><label class="search-box"><input class="search-input" id="client-search" type="search" placeholder="Search clients" aria-label="Search clients"></label>
      <button class="button button-primary button-small" data-action="new-project">+ New project</button></div>
      <section class="panel"><div class="panel-header"><div><h2 class="panel-title">Client relationships</h2><p class="panel-subtitle">${clients.length} active clients in your pipeline</p></div></div>
      <div class="clients-grid" id="clients-grid">${clients.map((entry) => {
        const balance = entry.projects.reduce((sum, project) => sum + Number(project.amount), 0);
        const statuses = entry.projects.map((project) => projectStatus(project));
        const health = statuses.includes("Awaiting approval") ? "Needs follow-up" : statuses.includes("In progress") ? "Active" : "Ready";
        return `<article class="client-card">
          <div class="client-card-top">
            <div class="avatar avatar-green client-avatar">${entry.client.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase()}</div>
            <div>
              <strong>${escapeHtml(entry.client)}</strong>
              <small>${entry.projects.length} project${entry.projects.length === 1 ? "" : "s"}</small>
            </div>
          </div>
          <div class="client-stats">
            <div><span>Total value</span><strong>${money(balance)}</strong></div>
            <div><span>Status</span><strong>${health}</strong></div>
          </div>
          <ul class="client-project-list">${entry.projects.map((project) => `<li><span>${escapeHtml(project.name)}</span><em>${projectStatus(project)}</em></li>`).join("")}</ul>
          <div class="client-footer"><span>Next check-in</span><strong>${formatDate(entry.latest, { month: "short", day: "numeric" })}</strong></div>
        </article>`;
      }).join("") || '<div class="empty-state">No clients yet. Add a project to begin tracking relationships.</div>'}</div></section>`;
  }

  function activityMarkup() {
    return `<section class="panel"><div class="panel-header"><div><h2 class="panel-title">Activity log</h2><p class="panel-subtitle">A record of changes made in your workspace.</p></div></div>
      <div class="activity-panel">${state.activity.length ? state.activity.map(activityItem).join("") : '<div class="empty-state">Updates will appear here as your projects move forward.</div>'}</div></section>`;
  }

  function projectDetailMarkup(project) {
    const status = projectStatus(project);
    const projectInvoices = state.invoices.filter((invoice) => invoice.projectId === project.id);
    const nextMilestone = project.milestones.find((milestone) => milestone.status !== "approved");
    const invoiceActions = projectInvoices.length
      ? projectInvoices.map((invoice) => `<div class="detail-row"><span>${escapeHtml(invoice.id)}</span><strong>${money(invoice.amount)}</strong></div>${invoiceVerification(invoice)}${solPaymentButton(invoice)}`).join("")
      : '<p class="field-hint">No invoice record yet.</p>';
    return `<button class="detail-back" data-page="projects">← Back to projects</button>
      <div class="detail-heading"><div><p class="eyebrow">PROJECT OVERVIEW</p><h1>${escapeHtml(project.name)}</h1><div class="detail-meta"><span>${escapeHtml(project.client)}</span><span>·</span><span>${money(project.amount)} agreed</span><span>·</span><span>Due ${formatDate(project.due, { month: "long", day: "numeric", year: "numeric" })}</span></div></div><span class="status-pill ${statusClass(status)}">${status}</span></div>
      <div class="detail-layout">
        <section class="panel"><div class="panel-header"><div><h2 class="panel-title">Milestones</h2><p class="panel-subtitle">Agree on the work; track approvals here.</p></div><button class="button button-quiet button-small" data-add-milestone="${escapeHtml(project.id)}">+ Add milestone</button></div>
          ${project.milestones.map((milestone, index) => `<div class="milestone-card"><span class="milestone-check ${milestone.status === "approved" ? "done" : ""}">${milestone.status === "approved" ? "✓" : `${index + 1}`}</span><div class="milestone-body"><strong>${escapeHtml(milestone.name)}</strong><small>${milestone.status === "approved" ? "Approved by client" : milestone.status === "submitted" ? "Submitted · waiting for client approval" : milestone.status === "in_progress" ? "In progress" : "Not started"}</small>
            ${milestone.status === "pending" ? `<button class="text-button milestone-action" data-milestone-action="start" data-project="${escapeHtml(project.id)}" data-milestone="${escapeHtml(milestone.id)}">Start work</button>` : ""}
            ${milestone.status === "in_progress" ? `<button class="text-button milestone-action" data-milestone-action="submit" data-project="${escapeHtml(project.id)}" data-milestone="${escapeHtml(milestone.id)}">Submit for approval →</button>` : ""}
            ${milestone.status === "submitted" ? `<button class="text-button milestone-action" data-milestone-action="approve" data-project="${escapeHtml(project.id)}" data-milestone="${escapeHtml(milestone.id)}">Record client approval ✓</button>` : ""}
          </div></div>`).join("")}
        </section>
        <div class="right-column">
          <section class="panel"><div class="panel-header"><div><h2 class="panel-title">Project details</h2><p class="panel-subtitle">A shared record of the agreement.</p></div></div><div class="detail-sidebar-section">
            <div class="detail-row"><span>Client</span><strong>${escapeHtml(project.client)}</strong></div><div class="detail-row"><span>Agreed value</span><strong>${money(project.amount)}</strong></div><div class="detail-row"><span>Target date</span><strong>${formatDate(project.due, { month: "short", day: "numeric", year: "numeric" })}</strong></div><div class="detail-row"><span>Milestones</span><strong>${project.milestones.filter((item) => item.status === "approved").length} of ${project.milestones.length} approved</strong></div>
            ${nextMilestone && nextMilestone.status === "submitted" ? '<div class="detail-warning">Approval is a project record. It does not trigger a payment or guarantee funds.</div>' : ""}
          </div></section>
          <section class="panel"><div class="panel-header"><div><h2 class="panel-title">Invoice records</h2><p class="panel-subtitle">Payment history and Devnet SOL requests.</p></div></div><div class="detail-sidebar-section">${invoiceActions}</div></section>
        </div>
      </div>`;
  }

  function render() {
    const selectedProject = openProjectId && state.projects.find((project) => project.id === openProjectId);
    if (openProjectId && !selectedProject) openProjectId = null;
    const page = selectedProject ? "projects" : currentPage;
    document.getElementById("breadcrumb-page").textContent = selectedProject ? "Project details" : pageTitles[page];
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === page));
    document.getElementById("project-count").textContent = String(state.projects.length);
    const clientCount = new Set(state.projects.map((project) => project.client)).size;
    document.getElementById("client-count").textContent = String(clientCount);
    const accountName = document.querySelector(".profile-button .workspace-copy strong").textContent.trim();
    const accountFirstName = accountName.split(/\s+/)[0];
    const headings = {
      overview: [new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(today).toUpperCase(), `${today.getHours() < 12 ? "Good morning" : today.getHours() < 17 ? "Good afternoon" : "Good evening"}, ${accountFirstName}`, "Here’s what’s happening with your freelance work."],
      projects: ["YOUR WORKSPACE", "Projects", "Keep every brief, milestone, and next step in one place."],
      clients: ["CLIENTS", "Client relationships", "Stay close to your clients and keep work moving without friction."],
      invoices: ["YOUR RECORDS", "Invoices & payments", "Create Devnet SOL requests and track confirmed payments."],
      activity: ["WORKSPACE HISTORY", "Activity", "A transparent timeline of your project updates."]
    };
    const heading = headings[page];
    document.getElementById("heading-eyebrow").textContent = selectedProject ? "PROJECT DETAILS" : heading[0];
    document.getElementById("heading-title").innerHTML = selectedProject ? "" : `${heading[1]}${page === "overview" ? ' <span class="wave">✳</span>' : ""}`;
    if (selectedProject) document.getElementById("heading-title").textContent = "";
    document.getElementById("heading-subtitle").textContent = selectedProject ? "" : heading[2];
    document.getElementById("page-heading").hidden = Boolean(selectedProject);
    document.getElementById("new-project-button").hidden = page !== "overview" && page !== "projects" && page !== "clients";
    view.innerHTML = selectedProject ? projectDetailMarkup(selectedProject) : ({
      overview: overviewMarkup,
      projects: projectsMarkup,
      clients: clientsMarkup,
      invoices: invoicesMarkup,
      activity: activityMarkup
    })[currentPage]();
    attachViewHandlers();
  }

  function setPage(page) {
    if (!pageTitles[page]) return;
    currentPage = page;
    openProjectId = null;
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("mobile-overlay").classList.remove("visible");
    render();
  }

  function addActivity(text, subject) {
    state.activity.unshift({ id: uid(), text, subject, date: day(0) });
    state.activity = state.activity.slice(0, 40);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  function openProject(id) {
    openProjectId = id;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateProjectsList() {
    const search = document.getElementById("project-search");
    const filter = document.getElementById("project-filter");
    const results = state.projects.filter((project) => {
      const matchesText = `${project.name} ${project.client}`.toLowerCase().includes(search.value.toLowerCase());
      return matchesText && (filter.value === "all" || projectStatus(project) === filter.value);
    }).sort((a, b) => a.due.localeCompare(b.due));
    document.getElementById("projects-table").innerHTML = projectTable(results);
    bindProjectOpeners();
  }

  function updateClientsList() {
    const search = document.getElementById("client-search");
    const container = document.getElementById("clients-grid");
    if (!search || !container) return;
    const clientMap = new Map();
    state.projects.forEach((project) => {
      const key = project.client;
      if (!clientMap.has(key)) {
        clientMap.set(key, { client: key, projects: [] });
      }
      clientMap.get(key).projects.push(project);
    });
    const clients = [...clientMap.values()].filter((entry) => `${entry.client} ${entry.projects.map((project) => project.name).join(" ")}`.toLowerCase().includes(search.value.toLowerCase())).sort((a, b) => b.projects.reduce((sum, project) => sum + Number(project.amount), 0) - a.projects.reduce((sum, project) => sum + Number(project.amount), 0));
    container.innerHTML = clients.map((entry) => {
      const balance = entry.projects.reduce((sum, project) => sum + Number(project.amount), 0);
      const statuses = entry.projects.map((project) => projectStatus(project));
      const health = statuses.includes("Awaiting approval") ? "Needs follow-up" : statuses.includes("In progress") ? "Active" : "Ready";
      return `<article class="client-card">
        <div class="client-card-top">
          <div class="avatar avatar-green client-avatar">${entry.client.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase()}</div>
          <div>
            <strong>${escapeHtml(entry.client)}</strong>
            <small>${entry.projects.length} project${entry.projects.length === 1 ? "" : "s"}</small>
          </div>
        </div>
        <div class="client-stats">
          <div><span>Total value</span><strong>${money(balance)}</strong></div>
          <div><span>Status</span><strong>${health}</strong></div>
        </div>
        <ul class="client-project-list">${entry.projects.map((project) => `<li><span>${escapeHtml(project.name)}</span><em>${projectStatus(project)}</em></li>`).join("")}</ul>
        <div class="client-footer"><span>Next check-in</span><strong>${formatDate([...entry.projects].sort((a, b) => a.due.localeCompare(b.due))[0].due, { month: "short", day: "numeric" })}</strong></div>
      </article>`;
    }).join("") || '<div class="empty-state">No clients match your search.</div>';
  }

  function updateInvoicesList() {
    const search = document.getElementById("invoice-search");
    const filter = document.getElementById("invoice-filter");
    const container = document.getElementById("invoice-table-container");
    if (!search || !filter || !container || !state.invoices.length) return;
    const rows = [...state.invoices].filter((invoice) => {
      const project = projectForInvoice(invoice);
      const matchesText = `${invoice.id} ${project ? project.name : ""} ${project ? project.client : ""}`.toLowerCase().includes(search.value.toLowerCase());
      return matchesText && (filter.value === "all" || invoice.paymentStatus === filter.value);
    }).sort((a, b) => b.issued.localeCompare(a.issued));
    if (!rows.length) {
      container.innerHTML = '<div class="empty-state">No invoices match your search.</div>';
      return;
    }
    container.innerHTML = `<div class="listing-table-wrap"><table class="project-table listing-table"><thead><tr><th>INVOICE</th><th>PROJECT</th><th>AMOUNT</th><th>ISSUED</th><th>PAYMENT STATUS</th><th></th></tr></thead><tbody id="invoice-rows">${rows.map((invoice) => {
      const project = projectForInvoice(invoice);
      const label = paymentStatusLabel(invoice);
      return `<tr><td><span class="invoice-id">${escapeHtml(invoice.id)}</span></td><td><span class="project-name">${escapeHtml(project ? project.name : "Project invoice")}</span><span class="project-client">${escapeHtml(project ? project.client : "Project archived")}</span></td><td><span class="project-amount">${money(invoice.amount)}</span></td><td><span class="date-text">${formatDate(invoice.issued)}</span></td><td><span class="status-pill ${statusClass(label)}">${label}</span><br>${invoiceVerification(invoice)}</td><td>${solPaymentButton(invoice)}<button class="table-action" data-invoice-action="${escapeHtml(invoice.id)}">${invoice.paymentStatus === "paid" ? "View record" : "Update record"}</button></td></tr>`;
    }).join("")}</tbody></table></div>`;
    bindInvoiceActions();
    bindSolPaymentActions();
  }

  function bindProjectOpeners() {
    view.querySelectorAll("[data-open-project]").forEach((button) => button.addEventListener("click", () => openProject(button.dataset.openProject)));
  }

  function bindInvoiceActions() {
    view.querySelectorAll("[data-invoice-action]").forEach((button) => button.addEventListener("click", () => openInvoiceDialog(button.dataset.invoiceAction)));
  }

  function attachViewHandlers() {
    view.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => setPage(button.dataset.page)));
    bindProjectOpeners();
    bindInvoiceActions();
    bindSolPaymentActions();
    view.querySelectorAll("[data-action='new-project']").forEach((button) => button.addEventListener("click", openModal));
    const projectSearch = document.getElementById("project-search");
    if (projectSearch) {
      projectSearch.addEventListener("input", updateProjectsList);
      document.getElementById("project-filter").addEventListener("change", updateProjectsList);
    }
    const clientSearch = document.getElementById("client-search");
    if (clientSearch) {
      clientSearch.addEventListener("input", updateClientsList);
    }
    const invoiceSearch = document.getElementById("invoice-search");
    if (invoiceSearch) {
      invoiceSearch.addEventListener("input", updateInvoicesList);
      document.getElementById("invoice-filter").addEventListener("change", updateInvoicesList);
    }
    view.querySelectorAll("[data-milestone-action]").forEach((button) => button.addEventListener("click", () => updateMilestone(button.dataset.project, button.dataset.milestone, button.dataset.milestoneAction)));
    view.querySelectorAll("[data-add-milestone]").forEach((button) => button.addEventListener("click", () => addMilestone(button.dataset.addMilestone)));
  }

  function updateMilestone(projectId, milestoneId, action) {
    const project = state.projects.find((item) => item.id === projectId);
    const milestone = project && project.milestones.find((item) => item.id === milestoneId);
    if (!project || !milestone) return;
    const changes = {
      start: ["in_progress", "Started work on", milestone.name],
      submit: ["submitted", "Submitted milestone for approval:", milestone.name],
      approve: ["approved", "Client approval recorded for", milestone.name]
    };
    const update = changes[action];
    if (!update) return;
    milestone.status = update[0];
    addActivity(update[1], `${project.name} — ${update[2]}`);
    if (action === "approve" && !state.invoices.some((invoice) => invoice.projectId === project.id && invoice.memo === milestone.name)) {
      state.invoices.unshift({ id: nextInvoiceId(), projectId: project.id, amount: Number((project.amount / project.milestones.length).toFixed(2)), issued: day(0), paymentStatus: "outstanding", verification: null, memo: milestone.name });
      addActivity("Invoice record created for", `${project.name} — ${milestone.name}`);
    }
    saveState();
    render();
    showToast(action === "approve" ? "Client approval recorded. No payment was triggered." : action === "submit" ? "Milestone submitted for client review." : "Milestone marked in progress.");
  }

  function addMilestone(projectId) {
    const project = state.projects.find((item) => item.id === projectId);
    if (!project) return;
    const name = window.prompt("What is the next milestone?");
    if (name === null) return;
    if (!name.trim()) {
      showToast("Enter a milestone name to add it.");
      return;
    }
    project.milestones.push({ id: uid(), name: name.trim().slice(0, 80), status: "pending" });
    addActivity("Added milestone to", project.name);
    saveState();
    render();
    showToast("Milestone added.");
  }

  function openInvoiceDialog(invoiceId) {
    const invoice = state.invoices.find((item) => item.id === invoiceId);
    if (!invoice) return;
    const project = projectForInvoice(invoice);
    currentInvoiceId = invoice.id;
    document.getElementById("invoice-modal-description").textContent = `${invoice.id} · ${project ? project.name : "Archived project"} · ${money(invoice.amount)}`;
    invoiceForm.reset();
    document.getElementById("provider-confirmation").classList.remove("visible");
    invoiceModal.hidden = false;
    document.body.style.overflow = "hidden";
    invoiceModal.querySelector('input[name="verification"]').focus();
  }

  function closeInvoiceModal() {
    invoiceModal.hidden = true;
    currentInvoiceId = null;
    document.body.style.overflow = "";
    invoiceForm.reset();
    document.getElementById("provider-confirmation").classList.remove("visible");
  }

  function openSolPaymentDialog(invoiceId) {
    const invoice = state.invoices.find((item) => item.id === invoiceId);
    if (!invoice || invoice.paymentStatus === "paid") return;
    if (!window.solanaWeb3) {
      showToast("Solana tools did not load. Check your internet connection and reload the page.");
      return;
    }
    if (!connectedWallet && (!invoice.solPayment || solPaymentRequestExpired(invoice.solPayment))) {
      showToast("Connect Phantom first to set your receiving wallet.");
      return;
    }
    currentSolInvoiceId = invoice.id;
    const project = projectForInvoice(invoice);
    document.getElementById("sol-payment-description").textContent = `${invoice.id} · ${project ? project.name : "Archived project"} · Invoice total ${money(invoice.amount)} USD`;
    solPaymentForm.reset();
    document.getElementById("sol-payment-amount").disabled = false;
    document.getElementById("sol-payment-request").hidden = true;
    document.getElementById("create-sol-payment-request").hidden = false;
    document.getElementById("sol-payment-status").textContent = "";
    solPaymentModal.hidden = false;
    document.body.style.overflow = "hidden";
    if (invoice.solPayment) {
      showSolPaymentRequest(invoice);
      document.getElementById("check-sol-payment").focus();
    } else {
      document.getElementById("sol-payment-amount").focus();
    }
  }

  function closeSolPaymentDialog() {
    solPaymentModal.hidden = true;
    currentSolInvoiceId = null;
    document.body.style.overflow = "";
    solPaymentForm.reset();
  }

  solPaymentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const invoice = state.invoices.find((item) => item.id === currentSolInvoiceId);
    if (!invoice || invoice.paymentStatus === "paid") return;
    if (!connectedWallet) {
      showToast("Connect Phantom first to set your receiving wallet.");
      return;
    }
    try {
      const amount = document.getElementById("sol-payment-amount").value.trim();
      solToLamports(amount);
      const reference = window.solanaWeb3.Keypair.generate().publicKey.toString();
      invoice.solPayment = {
        amount,
        recipient: connectedWallet,
        reference,
        expiresAt: new Date(Date.now() + SOL_PAYMENT_REQUEST_TTL_MS).toISOString()
      };
      saveState();
      showSolPaymentRequest(invoice);
      view.querySelectorAll(`[data-sol-payment="${CSS.escape(invoice.id)}"]`).forEach((button) => {
        button.textContent = "View SOL request";
      });
    } catch (error) {
      showToast(error.message);
    }
  });

  document.getElementById("copy-sol-payment-link").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(document.getElementById("sol-payment-uri").value);
      showToast("Solana Pay link copied.");
    } catch (error) {
      console.error("Could not copy the Solana Pay link.", error);
      showToast("Could not copy the link. Select and copy it manually.");
    }
  });

  document.getElementById("replace-sol-payment-request").addEventListener("click", () => {
    const invoice = state.invoices.find((item) => item.id === currentSolInvoiceId);
    if (!invoice || !invoice.solPayment || !solPaymentRequestExpired(invoice.solPayment) || !connectedWallet) {
      showToast("Connect Phantom and wait for the current request to expire before replacing it.");
      return;
    }
    document.getElementById("sol-payment-request").hidden = true;
    document.getElementById("sol-payment-amount").disabled = false;
    document.getElementById("create-sol-payment-request").hidden = false;
    document.getElementById("sol-payment-amount").focus();
  });

  document.getElementById("check-sol-payment").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const invoice = state.invoices.find((item) => item.id === currentSolInvoiceId);
    if (!invoice || invoice.paymentStatus === "paid" || !invoice.solPayment || checkingSolPayment) return;
    if (solPaymentRequestExpired(invoice.solPayment)) {
      showSolPaymentRequest(invoice);
      return;
    }
    const payment = { ...invoice.solPayment };
    const invoiceId = invoice.id;
    checkingSolPayment = true;
    button.disabled = true;
    document.getElementById("sol-payment-status").textContent = "Checking confirmed Devnet transactions…";
    try {
      const web3 = window.solanaWeb3;
      const connection = new web3.Connection(SOLANA_DEVNET_RPC, "confirmed");
      const reference = new web3.PublicKey(payment.reference);
      const expectedLamports = solToLamports(payment.amount);
      const signatures = await connection.getSignaturesForAddress(reference, { limit: 25 }, "confirmed");
      let matchingSignature = null;
      for (const entry of signatures) {
        if (entry.err) continue;
        const signatureStatus = await connection.getSignatureStatuses([entry.signature], { searchTransactionHistory: true });
        if (!isConfirmedSignatureStatus(signatureStatus.value[0])) continue;
        const transaction = await connection.getParsedTransaction(entry.signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0
        });
        if (!transaction || !transaction.meta || transaction.meta.err) continue;
        if (!transaction.transaction.signatures.includes(entry.signature)
          || !transactionIncludesReference(transaction, payment.reference)
          || !transactionHasMatchingTransfer(transaction, payment, expectedLamports)) continue;
        if (entry.confirmationStatus !== "confirmed" && entry.confirmationStatus !== "finalized") continue;
        matchingSignature = entry.signature;
        break;
      }
      if (!matchingSignature) {
        document.getElementById("sol-payment-status").textContent = "No matching confirmed payment found yet. The invoice remains outstanding.";
        return;
      }
      if (solPaymentRequestExpired(payment)) {
        document.getElementById("sol-payment-status").textContent = "This payment request expired during verification. It was not accepted.";
        return;
      }
      const finalStatus = await connection.getSignatureStatuses([matchingSignature], { searchTransactionHistory: true });
      const finalTransaction = await connection.getParsedTransaction(matchingSignature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0
      });
      if (!isConfirmedSignatureStatus(finalStatus.value[0])
        || !finalTransaction || !finalTransaction.meta || finalTransaction.meta.err
        || !finalTransaction.transaction.signatures.includes(matchingSignature)
        || !transactionIncludesReference(finalTransaction, payment.reference)
        || !transactionHasMatchingTransfer(finalTransaction, payment, expectedLamports)) {
        document.getElementById("sol-payment-status").textContent = "The transfer could not be reconfirmed at confirmed commitment. The invoice remains outstanding.";
        return;
      }
      const currentInvoice = state.invoices.find((item) => item.id === invoiceId);
      if (currentSolInvoiceId !== invoiceId || !currentInvoice || currentInvoice.paymentStatus === "paid" || !currentInvoice.solPayment
        || currentInvoice.solPayment.reference !== payment.reference || solPaymentRequestExpired(currentInvoice.solPayment)
        || signatureAlreadyApplied(state.invoices, invoiceId, matchingSignature)) {
        document.getElementById("sol-payment-status").textContent = "The invoice or request changed during verification. No payment state was changed.";
        return;
      }
      currentInvoice.paymentStatus = "paid";
      currentInvoice.verification = "solana_devnet";
      currentInvoice.solanaSignature = matchingSignature;
      currentInvoice.solanaConfirmedAt = new Date().toISOString();
      addActivity("Devnet SOL payment confirmed for", currentInvoice.id);
      saveState();
      closeSolPaymentDialog();
      render();
      showToast("Devnet payment confirmed and invoice updated.");
    } catch (error) {
      console.error("Could not verify the Solana Devnet payment.", error);
      document.getElementById("sol-payment-status").textContent = `Could not check Devnet: ${error.message}`;
    } finally {
      checkingSolPayment = false;
      const currentInvoice = state.invoices.find((item) => item.id === invoiceId);
      button.disabled = !currentInvoice || !currentInvoice.solPayment || solPaymentRequestExpired(currentInvoice.solPayment);
    }
  });

  invoiceForm.addEventListener("change", (event) => {
    if (event.target.name === "verification") {
      document.getElementById("provider-confirmation").classList.toggle("visible", event.target.value === "provider");
    }
  });

  invoiceForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const invoice = state.invoices.find((item) => item.id === currentInvoiceId);
    const verification = new FormData(invoiceForm).get("verification");
    if (!invoice || (verification !== "provider" && verification !== "client")) return;
    if (verification === "provider" && !document.getElementById("provider-checked").checked) {
      showToast("Confirm you verified payment with your provider.");
      return;
    }
    invoice.paymentStatus = verification === "provider" ? "paid" : "processing";
    invoice.verification = verification;
    addActivity(verification === "provider" ? "Provider-confirmed payment recorded for" : "Client-reported payment recorded for", invoice.id);
    saveState();
    closeInvoiceModal();
    render();
    showToast(verification === "provider" ? "Provider-confirmed record saved." : "Saved as client-reported, not verified.");
  });

  function openModal() {
    modal.hidden = false;
    document.getElementById("project-name").focus();
    document.getElementById("project-due").value = day(14);
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
    projectForm.reset();
  }

  projectForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!projectForm.reportValidity()) return;
    const form = new FormData(projectForm);
    const project = {
      id: `prj-${uid()}`,
      name: String(form.get("name")).trim(),
      client: String(form.get("client")).trim(),
      amount: Number(form.get("amount")),
      due: String(form.get("due")),
      milestones: [{ id: uid(), name: String(form.get("milestone")).trim(), status: "pending" }]
    };
    if (!project.name || !project.client || !project.milestones[0].name || !Number.isFinite(project.amount) || project.amount <= 0 || !project.due) {
      showToast("Check the project details and try again.");
      return;
    }
    state.projects.unshift(project);
    addActivity("Project created:", project.name);
    saveState();
    closeModal();
    currentPage = "projects";
    render();
    showToast("Project created. No funds have been moved.");
  });

  document.getElementById("new-project-button").addEventListener("click", openModal);
  document.getElementById("close-modal").addEventListener("click", closeModal);
  document.getElementById("cancel-modal").addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
  document.getElementById("close-invoice-modal").addEventListener("click", closeInvoiceModal);
  document.getElementById("cancel-invoice-modal").addEventListener("click", closeInvoiceModal);
  invoiceModal.addEventListener("click", (event) => { if (event.target === invoiceModal) closeInvoiceModal(); });
  document.getElementById("close-sol-payment-modal").addEventListener("click", closeSolPaymentDialog);
  document.getElementById("cancel-sol-payment-modal").addEventListener("click", closeSolPaymentDialog);
  solPaymentModal.addEventListener("click", (event) => { if (event.target === solPaymentModal) closeSolPaymentDialog(); });
  document.getElementById("wallet-button").addEventListener("click", async () => {
    const provider = walletProvider();
    if (!provider) {
      showToast("Phantom was not found. Install the Phantom browser extension, then reload.");
      return;
    }
    try {
      if (connectedWallet) {
        await provider.disconnect();
        setWalletStatus(null);
      } else {
        const response = await provider.connect();
        setWalletStatus(response.publicKey);
      }
    } catch (error) {
      console.error("Could not connect to Phantom.", error);
      showToast(`Wallet connection failed: ${error.message || "request was cancelled"}`);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
    if (event.key === "Escape" && !invoiceModal.hidden) closeInvoiceModal();
    if (event.key === "Escape" && !solPaymentModal.hidden) closeSolPaymentDialog();
  });
  document.querySelectorAll(".nav-item, .brand[data-page]").forEach((button) => button.addEventListener("click", () => setPage(button.dataset.page)));
  document.getElementById("mobile-menu").addEventListener("click", () => {
    document.getElementById("sidebar").classList.add("open");
    document.getElementById("mobile-overlay").classList.add("visible");
  });
  const overlay = document.createElement("div");
  overlay.id = "mobile-overlay";
  overlay.className = "mobile-overlay";
  overlay.addEventListener("click", () => {
    document.getElementById("sidebar").classList.remove("open");
    overlay.classList.remove("visible");
  });
  document.body.append(overlay);

  initializeWallet();
  setAccountAvatarInitials();
  render();
})();
