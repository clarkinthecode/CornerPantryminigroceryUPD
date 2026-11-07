// ============================================================
// GROCERY POS - script.js
// ============================================================

const API = "";
let currentUser = null;
let employeesCache = [];
let productsCache = [];

function getDefaultProducts() {
  const dateAdded = new Date().toLocaleDateString("en-PH");
  return [
    { id: 1001, name: "Rice (1kg)", category: "Grains, Pasta & Staples", price: 58, stock: 500, dateAdded },
    { id: 1002, name: "Eggs (1 tray)", category: "Dairy & Eggs", price: 180, stock: 500, dateAdded },
    { id: 1003, name: "Milk (1L)", category: "Dairy & Eggs", price: 85, stock: 500, dateAdded },
    { id: 1004, name: "Bread (Loaf)", category: "Bakery & Bread", price: 65, stock: 500, dateAdded },
    { id: 1005, name: "Canned Tuna", category: "Canned & Packed Goods", price: 35, stock: 500, dateAdded },
    { id: 1006, name: "Instant Noodles", category: "Canned & Packed Goods", price: 15, stock: 500, dateAdded },
    { id: 1007, name: "Cooking Oil (1L)", category: "Grains, Pasta & Staples", price: 125, stock: 500, dateAdded },
    { id: 1008, name: "Sugar (1kg)", category: "Grains, Pasta & Staples", price: 68, stock: 500, dateAdded },
    { id: 1009, name: "Salt (1kg)", category: "Grains, Pasta & Staples", price: 20, stock: 500, dateAdded },
    { id: 1010, name: "Coffee (200g)", category: "Beverages", price: 95, stock: 500, dateAdded },
    { id: 1011, name: "Vinegar (1L)", category: "Condiments & Spices", price: 30, stock: 500, dateAdded },
    { id: 1012, name: "Soy Sauce (1L)", category: "Condiments & Spices", price: 40, stock: 500, dateAdded },
    { id: 1013, name: "Canned Sardines", category: "Canned & Packed Goods", price: 22, stock: 500, dateAdded },
    { id: 1014, name: "Garlic (250g)", category: "Fresh Produce", price: 25, stock: 500, dateAdded },
    { id: 1015, name: "Onion (1kg)", category: "Fresh Produce", price: 60, stock: 500, dateAdded },
    { id: 1016, name: "Tomato (1kg)", category: "Fresh Produce", price: 50, stock: 500, dateAdded },
    { id: 1017, name: "Butter (225g)", category: "Dairy & Eggs", price: 110, stock: 500, dateAdded },
    { id: 1018, name: "Cheese (165g)", category: "Dairy & Eggs", price: 75, stock: 500, dateAdded },
    { id: 1019, name: "Shampoo (180ml)", category: "Health & Beauty", price: 90, stock: 500, dateAdded },
    { id: 1020, name: "Laundry Soap", category: "Cleaning Supplies", price: 18, stock: 500, dateAdded },
    { id: 1021, name: "Potato Chips (Large)", category: "Snacks & Sweets", price: 95, stock: 500, dateAdded },
    { id: 1022, name: "Corn Chips (Small)", category: "Snacks & Sweets", price: 15, stock: 500, dateAdded },
    { id: 1023, name: "Chocolate Bar", category: "Snacks & Sweets", price: 35, stock: 500, dateAdded },
    { id: 1024, name: "Biscuit Pack", category: "Snacks & Sweets", price: 55, stock: 500, dateAdded },
  ];
}

const clientStore = {
  get(key, defaultVal) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : defaultVal;
    } catch (e) {
      return defaultVal;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
  },
  getProducts() {
    let prods = this.get("cp_products", null);
    if (!prods || !Array.isArray(prods) || prods.length === 0) {
      prods = getDefaultProducts();
      this.set("cp_products", prods);
    }
    prods.forEach((p) => {
      if (!p.stock || p.stock < 500) p.stock = 500;
    });
    return prods;
  },
  getSales() {
    return this.get("cp_sales", []);
  },
  getStockins() {
    return this.get("cp_stockins", []);
  },
  getEmployees() {
    return this.get("cp_employees", []);
  },
  getUsers() {
    return this.get("cp_users", [{ id: 1, username: "admin", role: "Admin" }]);
  },
};

async function apiCall(endpoint, method = "GET", data = null) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const options = {
      method,
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    };
    if (data && (method === "POST" || method === "PUT")) {
      options.body = JSON.stringify(data);
    }
    const res = await fetch(`${API}${endpoint}`, options);
    clearTimeout(timeoutId);
    if (res.ok) {
      return await res.json().catch(() => ({ success: true }));
    }
  } catch (err) {}
  return null;
}

function formatPeso(value) {
  const num = Number(value) || 0;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function getProductStatus(stock) {
  const qty = Number(stock) || 0;
  if (qty <= 0) {
    return `<span class="status out-of-stock">Out of Stock</span>`;
  }
  if (qty <= 5) {
    return `<span class="status low-stock">Low Stock</span>`;
  }
  return `<span class="status in-stock">In Stock</span>`;
}

function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "toast-error" : type === "info" ? "toast-info" : ""}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 2900);
}

// ========================
// AUTH GUARD & INITIALIZATION
// ========================
document.addEventListener("DOMContentLoaded", () => {
  const stored = sessionStorage.getItem("currentUser");

  if (!stored) {
    window.location.href = "login.html";
    return;
  }

  try {
    currentUser = JSON.parse(stored);
  } catch (e) {
    sessionStorage.removeItem("currentUser");
    window.location.href = "login.html";
    return;
  }

  // Display user info in sidebar
  const userEl = document.getElementById("sidebar-user");
  if (userEl) {
    userEl.textContent = `${currentUser.username} (${currentUser.role})`;
  }

  // Show Users navigation link if Admin
  const usersLink = document.getElementById("users-nav-link");
  if (usersLink && currentUser.role === "Admin") {
    usersLink.style.display = "block";
  }

  // Show the main application
  const appContainer = document.getElementById("app-container");
  if (appContainer) {
    appContainer.style.display = "flex";
  }

  // Show default page and fetch initial data
  showPage("dashboard");
  loadAllData();
});

function logout() {
  sessionStorage.removeItem("currentUser");
  window.location.href = "login.html";
}

// ========================
// PAGE NAVIGATION
// ========================
function showPage(pageId) {
  document.querySelectorAll(".page-content").forEach((p) => {
    p.style.display = "none";
  });

  const page = document.getElementById(pageId);
  if (page) {
    page.style.display = "block";
  }

  // Update active sidebar link
  document.querySelectorAll(".sidebar a").forEach((a) => {
    a.classList.remove("active");
  });
  const activeNav = document.getElementById(`nav-${pageId}`);
  if (activeNav) {
    activeNav.classList.add("active");
  }

  // Refresh page data on view
  if (pageId === "dashboard") renderDashboard();
  if (pageId === "products") renderProducts();
  if (pageId === "sales") {
    renderSales();
    populateSaleDropdown();
  }
  if (pageId === "stockin") {
    renderStockIn();
    populateStockInSuggestions();
  }
  if (pageId === "inventory") renderInventory();
  if (pageId === "reports") renderReports();
  if (pageId === "employees") renderEmployees();
  if (pageId === "users") renderUsers();
}

// ========================
// DATA FETCHING HELPERS
// ========================
function bust(url) {
  return `${url}?_t=${Date.now()}`;
}

async function fetchProducts() {
  const data = await apiCall(`/products`);
  if (Array.isArray(data) && data.length) {
    productsCache = data;
    clientStore.set("cp_products", data);
    return productsCache;
  }
  productsCache = clientStore.getProducts();
  return productsCache;
}

async function fetchSales() {
  const data = await apiCall(`/sales`);
  if (Array.isArray(data)) {
    clientStore.set("cp_sales", data);
    return data;
  }
  return clientStore.getSales();
}

async function fetchStockIns() {
  const data = await apiCall(`/stockins`);
  if (Array.isArray(data)) {
    clientStore.set("cp_stockins", data);
    return data;
  }
  return clientStore.getStockins();
}

async function fetchEmployees() {
  const data = await apiCall(`/employees`);
  if (Array.isArray(data)) {
    employeesCache = data;
    clientStore.set("cp_employees", data);
    return employeesCache;
  }
  employeesCache = clientStore.getEmployees();
  return employeesCache;
}

async function fetchUsers() {
  const data = await apiCall(`/users`);
  if (Array.isArray(data)) {
    clientStore.set("cp_users", data);
    return data;
  }
  return clientStore.getUsers();
}

async function loadAllData() {
  await Promise.all([
    renderDashboard(),
    renderProducts(),
    renderSales(),
    renderInventory(),
    renderStockIn(),
    renderEmployees(),
  ]);
  populateSaleDropdown();
  populateStockInSuggestions();
}

// ========================
// DASHBOARD
// ========================
async function renderDashboard() {
  const [products, sales] = await Promise.all([fetchProducts(), fetchSales()]);

  const totalSalesValue = sales.reduce(
    (sum, s) => sum + (parseFloat(s.revenue) || 0),
    0,
  );
  const cardTotal = document.getElementById("card-total");
  if (cardTotal) cardTotal.textContent = totalSalesValue.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const cardProducts = document.getElementById("card-products");
  if (cardProducts) cardProducts.textContent = products.length;

  const lowStockCount = products.filter((p) => Number(p.stock) <= 5).length;
  const cardLowStock = document.getElementById("card-low-stock");
  if (cardLowStock) cardLowStock.textContent = lowStockCount;

  const cardOrders = document.getElementById("card-orders");
  if (cardOrders) cardOrders.textContent = sales.length;

  const tbody = document.getElementById("dashboard-table");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#94a3b8">No products found.</td></tr>`;
    return;
  }

  const recent = [...products].slice(0, 5);
  recent.forEach((p) => {
    tbody.innerHTML += `
      <tr>
        <td>${escapeHtml(p.name)}</td>
        <td>${formatPeso(p.price)}</td>
        <td>${p.stock}</td>
        <td>${getProductStatus(p.stock)}</td>
      </tr>`;
  });
}

// ========================
// PRODUCTS MANAGEMENT
// ========================
function autoFillProduct() {
  const nameInput = document.getElementById("name");
  const typed = nameInput.value.trim().toLowerCase();
  const options = document.querySelectorAll("#product-suggestions option");
  const hint = document.getElementById("autofill-hint");

  let matched = false;
  options.forEach((option) => {
    if (option.value.toLowerCase() === typed) {
      const price = option.getAttribute("data-price");
      const category = option.getAttribute("data-category");
      if (price) document.getElementById("price").value = price;
      if (category) document.getElementById("category").value = category;
      if (hint) hint.style.display = "block";
      matched = true;
    }
  });

  if (!matched && hint) {
    hint.style.display = "none";
  }
}

async function renderProducts() {
  const products = await fetchProducts();
  const tbody = document.getElementById("table");
  if (!tbody) return;
  tbody.innerHTML = "";

  let totalValue = 0;

  if (products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#94a3b8">No products found. Add a product above.</td></tr>`;
  } else {
    products.forEach((p) => {
      const price = Number(p.price) || 0;
      const stock = Number(p.stock) || 0;
      totalValue += price * stock;
      const cat = p.category || "General";

      tbody.innerHTML += `
        <tr id="row-${p.id}">
          <td>${p.id}</td>
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(cat)}</td>
          <td>${formatPeso(price)}</td>
          <td>${stock}</td>
          <td>${getProductStatus(stock)}</td>
          <td>${p.dateAdded || "—"}</td>
          <td>
            <button type="button" onclick="editProduct(${p.id})" style="background:#f59e0b;color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;margin-right:5px;">Edit</button>
            <button type="button" onclick="deleteProduct(${p.id})" style="background:#ef4444;color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;">Delete</button>
          </td>
        </tr>`;
    });
  }

  const totalEl = document.getElementById("total-inventory-value");
  if (totalEl) totalEl.textContent = formatPeso(totalValue);
}

async function addProduct() {
  const name = document.getElementById("name").value.trim();
  const category = document.getElementById("category").value.trim();
  const price = parseFloat(document.getElementById("price").value);
  const stockInput = document.getElementById("stock");
  const parsedStock = stockInput ? parseInt(stockInput.value, 10) : 500;
  const stock = isNaN(parsedStock) || parsedStock < 500 ? 500 : parsedStock;

  if (!name || isNaN(price) || price < 0) {
    alert("Please enter a valid Product Name and Price.");
    return;
  }

  const pData = {
    id: Date.now(),
    name,
    category: category || "General",
    price,
    stock,
    dateAdded: new Date().toLocaleDateString("en-PH"),
  };

  const serverResult = await apiCall(`/products`, "POST", pData);
  const prods = clientStore.getProducts();
  prods.unshift(serverResult || pData);
  clientStore.set("cp_products", prods);
  productsCache = prods;

  document.getElementById("name").value = "";
  document.getElementById("category").value = "";
  document.getElementById("price").value = "";
  if (stockInput) stockInput.value = "500";
  const hint = document.getElementById("autofill-hint");
  if (hint) hint.style.display = "none";

  showToast("Product added successfully!");
  await renderProducts();
  await renderInventory();
  await renderDashboard();
  populateSaleDropdown();
  populateStockInSuggestions();
}

function editProduct(id) {
  const product = productsCache.find((p) => String(p.id) === String(id));
  if (!product) return;

  const row = document.getElementById(`row-${id}`);
  if (!row) return;

  const cells = row.querySelectorAll("td");
  if (cells.length < 8) return;

  cells[1].innerHTML = `<input type="text" id="edit-name-${id}" class="table-edit-input" value="${escapeHtml(product.name)}">`;
  cells[2].innerHTML = `<input type="text" id="edit-category-${id}" class="table-edit-input" value="${escapeHtml(product.category || 'General')}">`;
  cells[3].innerHTML = `<input type="number" step="0.01" id="edit-price-${id}" class="table-edit-input" value="${product.price}">`;
  cells[4].innerHTML = `<input type="number" id="edit-stock-${id}" class="table-edit-input" value="${product.stock}">`;
  cells[7].innerHTML = `
    <button type="button" onclick="saveProduct(${id})" style="background:#16a34a;color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;margin-right:5px;">Save</button>
    <button type="button" onclick="renderProducts()" style="background:#64748b;color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;">Cancel</button>
  `;
}

async function saveProduct(id) {
  const nameEl = document.getElementById(`edit-name-${id}`);
  const catEl = document.getElementById(`edit-category-${id}`);
  const priceEl = document.getElementById(`edit-price-${id}`);
  const stockEl = document.getElementById(`edit-stock-${id}`);

  if (!nameEl || !priceEl || !stockEl) return;

  const name = nameEl.value.trim();
  const category = catEl ? catEl.value.trim() : "General";
  const price = parseFloat(priceEl.value);
  const stock = parseInt(stockEl.value, 10);

  if (!name || isNaN(price) || price < 0 || isNaN(stock) || stock < 0) {
    alert("Please provide a valid name, price, and stock quantity.");
    return;
  }

  await apiCall(`/products/${id}`, "PUT", { name, category, price, stock });

  const prods = clientStore.getProducts();
  const p = prods.find((item) => String(item.id) === String(id));
  if (p) {
    p.name = name;
    p.category = category;
    p.price = price;
    p.stock = stock;
    clientStore.set("cp_products", prods);
    productsCache = prods;
  }

  showToast("Product updated successfully!");
  await renderProducts();
  await renderInventory();
  await renderDashboard();
  populateSaleDropdown();
  populateStockInSuggestions();
}

async function deleteProduct(id) {
  if (!confirm("Are you sure you want to delete this product?")) return;
  await apiCall(`/products/${id}`, "DELETE");
  let prods = clientStore.getProducts();
  prods = prods.filter((p) => String(p.id) !== String(id));
  clientStore.set("cp_products", prods);
  productsCache = prods;

  showToast("Product deleted successfully!", "info");
  await renderProducts();
  await renderInventory();
  await renderDashboard();
  populateSaleDropdown();
  populateStockInSuggestions();
}

// ========================
// SALES
// ========================
function populateSaleDropdown() {
  const select = document.getElementById("sale-product");
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = `<option value="">-- Select Product --</option>`;

  productsCache.forEach((p) => {
    select.innerHTML += `<option value="${p.id}" data-stock="${p.stock}" data-price="${p.price}">${escapeHtml(p.name)} (${formatPeso(p.price)})</option>`;
  });

  if (currentVal) {
    select.value = currentVal;
  }
  handleSaleProductChange();
}

function handleSaleProductChange() {
  const select = document.getElementById("sale-product");
  const stockDisplay = document.getElementById("sale-stock-display");
  const qtyInput = document.getElementById("sale-quantity");
  if (!select || !stockDisplay) return;

  const selectedOption = select.options[select.selectedIndex];
  if (!selectedOption || !select.value) {
    stockDisplay.value = "Available Stock: 0";
    if (qtyInput) {
      qtyInput.removeAttribute("max");
    }
    return;
  }

  const stock = parseInt(selectedOption.getAttribute("data-stock"), 10) || 0;
  stockDisplay.value = `Stock: ${stock}`;

  if (qtyInput) {
    qtyInput.max = stock;
    const currentQty = parseInt(qtyInput.value, 10);
    if (isNaN(currentQty) || currentQty <= 0) {
      qtyInput.value = stock > 0 ? "1" : "0";
    } else if (currentQty > stock) {
      qtyInput.value = stock;
    }
  }
}

async function recordSale() {
  const select = document.getElementById("sale-product");
  const qtyInput = document.getElementById("sale-quantity");
  const productId = select ? select.value : "";
  const quantity = qtyInput ? parseInt(qtyInput.value, 10) : 0;

  if (!productId) {
    alert("Please select a product.");
    return;
  }

  if (isNaN(quantity) || quantity <= 0) {
    alert("Please enter a valid quantity greater than zero.");
    return;
  }

  const selectedOption = select.options[select.selectedIndex];
  const stock = parseInt(selectedOption.getAttribute("data-stock"), 10) || 0;

  if (quantity > stock) {
    alert(`Insufficient stock! Only ${stock} available.`);
    return;
  }

  // Deduct stock in clientStore
  const prods = clientStore.getProducts();
  const p = prods.find((item) => String(item.id) === String(productId));
  if (p) {
    p.stock = Math.max(0, (parseInt(p.stock, 10) || 0) - quantity);
    clientStore.set("cp_products", prods);
    productsCache = prods;
  }

  const price = p ? Number(p.price) : Number(selectedOption.getAttribute("data-price") || 0);
  const saleRecord = {
    id: Date.now(),
    productId,
    productName: p ? p.name : selectedOption.textContent.split(" (")[0],
    quantity,
    revenue: parseFloat((quantity * price).toFixed(2)),
    date: new Date().toLocaleDateString("en-PH"),
    timestamp: new Date().toISOString(),
  };

  const sales = clientStore.getSales();
  sales.unshift(saleRecord);
  clientStore.set("cp_sales", sales);

  // Sync to server if online
  await apiCall(`/sales`, "POST", { productId, quantity });

  // Reset fields
  if (select) select.value = "";
  if (qtyInput) qtyInput.value = "";
  handleSaleProductChange();

  showToast("Sale recorded successfully!");
  await renderSales();
  await renderDashboard();
  await renderProducts();
  await renderInventory();
  populateSaleDropdown();
  populateStockInSuggestions();
}

async function renderSales() {
  const sales = await fetchSales();
  const tbody = document.getElementById("sales-table");
  if (!tbody) return;
  tbody.innerHTML = "";

  let totalRevenue = 0;

  if (sales.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#94a3b8">No sales recorded yet.</td></tr>`;
  } else {
    sales.forEach((s) => {
      const rev = parseFloat(s.revenue) || 0;
      totalRevenue += rev;
      tbody.innerHTML += `
        <tr>
          <td>${s.date || "—"}</td>
          <td>${escapeHtml(s.productName || "Unknown")}</td>
          <td>${s.quantity}</td>
          <td>${formatPeso(rev)}</td>
        </tr>`;
    });
  }

  const totalRevEl = document.getElementById("total-revenue");
  if (totalRevEl) totalRevEl.textContent = formatPeso(totalRevenue);
}

// ========================
// STOCK IN
// ========================
function populateStockInSuggestions() {
  const datalist = document.getElementById("si-suggestions");
  if (!datalist) return;
  datalist.innerHTML = "";
  productsCache.forEach((p) => {
    datalist.innerHTML += `<option value="${escapeHtml(p.name)}" data-price="${p.price}" data-category="${escapeHtml(p.category || 'General')}" data-stock="${p.stock}">`;
  });
}

function autoFillStockIn() {
  const nameInput = document.getElementById("si-name");
  const typed = nameInput.value.trim().toLowerCase();
  const datalist = document.getElementById("si-suggestions");
  const stockDisplay = document.getElementById("si-stock-display");
  if (!datalist) return;

  const options = datalist.getElementsByTagName("option");
  for (let i = 0; i < options.length; i++) {
    if (options[i].value.toLowerCase() === typed) {
      document.getElementById("si-price").value = options[i].getAttribute("data-price") || "";
      document.getElementById("si-category").value = options[i].getAttribute("data-category") || "General";
      if (stockDisplay) {
        stockDisplay.value = options[i].getAttribute("data-stock") || "0";
      }
      return;
    }
  }

  if (stockDisplay) {
    stockDisplay.value = "0";
  }
}

function clearStockInForm() {
  document.getElementById("si-name").value = "";
  document.getElementById("si-category").value = "General";
  document.getElementById("si-price").value = "";
  document.getElementById("si-qty").value = "";
  document.getElementById("si-source").value = "General Supplier";
  const stockDisplay = document.getElementById("si-stock-display");
  if (stockDisplay) stockDisplay.value = "";
}

async function recordStockIn() {
  const name = document.getElementById("si-name").value.trim();
  const category = document.getElementById("si-category").value.trim() || "General";
  const price = parseFloat(document.getElementById("si-price").value);
  const quantity = parseInt(document.getElementById("si-qty").value, 10);
  const source = document.getElementById("si-source").value;
  const employeeName = currentUser ? currentUser.username : "Unknown";

  if (!name || isNaN(price) || price < 0 || isNaN(quantity) || quantity <= 0) {
    alert("Please fill in a valid Product Name, Price, and Quantity to Add.");
    return;
  }

  // Update in clientStore
  const prods = clientStore.getProducts();
  let p = prods.find((item) => item.name.trim().toLowerCase() === name.trim().toLowerCase());
  let productId;
  if (p) {
    productId = p.id;
    p.price = price;
    if (category) p.category = category;
    p.stock = (parseInt(p.stock, 10) || 0) + quantity;
  } else {
    productId = Date.now();
    p = {
      id: productId,
      name: name.trim(),
      category: category || "General",
      price,
      stock: 500 + quantity,
      dateAdded: new Date().toLocaleDateString("en-PH"),
    };
    prods.unshift(p);
  }
  clientStore.set("cp_products", prods);
  productsCache = prods;

  const stockins = clientStore.getStockins();
  stockins.unshift({
    id: Date.now(),
    productId,
    productName: name.trim(),
    quantity,
    source: source || "General Supplier",
    employeeName,
    date: new Date().toLocaleDateString("en-PH"),
    timestamp: new Date().toISOString(),
  });
  clientStore.set("cp_stockins", stockins);

  // Sync to server if online
  await apiCall(`/stockins`, "POST", {
    name,
    category,
    price,
    quantity,
    source,
    employeeName,
  });

  clearStockInForm();
  showToast("Stock added successfully!");
  await renderStockIn();
  await renderProducts();
  await renderInventory();
  await renderDashboard();
  populateSaleDropdown();
  populateStockInSuggestions();
}

async function renderStockIn() {
  const stockins = await fetchStockIns();
  const tbody = document.getElementById("stockin-table");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (stockins.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#94a3b8">No stock in history recorded.</td></tr>`;
    return;
  }

  stockins.forEach((s) => {
    tbody.innerHTML += `
      <tr>
        <td>${s.id}</td>
        <td>${escapeHtml(s.productName || "—")}</td>
        <td>${escapeHtml(s.source || "General Supplier")}</td>
        <td>${escapeHtml(s.employeeName || "Unknown")}</td>
        <td>${s.quantity}</td>
        <td>${s.date || "—"}</td>
      </tr>`;
  });
}

// ========================
// INVENTORY
// ========================
async function renderInventory() {
  const products = await fetchProducts();
  const tbody = document.getElementById("inventory-table");
  if (!tbody) return;
  tbody.innerHTML = "";

  let totalStock = 0;

  if (products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#94a3b8">No products found in inventory.</td></tr>`;
  } else {
    products.forEach((p) => {
      const stock = Number(p.stock) || 0;
      totalStock += stock;
      tbody.innerHTML += `
        <tr>
          <td>${p.id}</td>
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(p.category || 'General')}</td>
          <td>${formatPeso(p.price)}</td>
          <td><strong>${stock}</strong></td>
          <td>${getProductStatus(stock)}</td>
          <td>${p.dateAdded || "—"}</td>
        </tr>`;
    });
  }

  const itemsEl = document.getElementById("inv-total-items");
  if (itemsEl) itemsEl.textContent = products.length;
  const stockEl = document.getElementById("inv-total-stock");
  if (stockEl) stockEl.textContent = totalStock.toLocaleString();
}

// ========================
// REPORTS
// ========================
async function renderReports() {
  const [products, sales] = await Promise.all([fetchProducts(), fetchSales()]);

  // Total Revenue
  const totalRevenue = sales.reduce(
    (sum, s) => sum + (parseFloat(s.revenue) || 0),
    0,
  );
  const totalRevEl = document.getElementById("report-total-rev");
  if (totalRevEl) totalRevEl.textContent = formatPeso(totalRevenue);

  // Total Products & Low Stock
  const totalProductsEl = document.getElementById("report-total-products");
  if (totalProductsEl) totalProductsEl.textContent = products.length;

  const lowStock = products.filter((p) => Number(p.stock) <= 5).length;
  const lowStockEl = document.getElementById("report-low-stock");
  if (lowStockEl) lowStockEl.textContent = lowStock;

  // Monthly Revenue (current month and year)
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const monthlyRevenue = sales
    .filter((s) => {
      const d = s.timestamp ? new Date(s.timestamp) : null;
      return d && !isNaN(d.getTime()) && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    })
    .reduce((sum, s) => sum + (parseFloat(s.revenue) || 0), 0);
  const monthlyRevEl = document.getElementById("report-monthly-rev");
  if (monthlyRevEl) monthlyRevEl.textContent = formatPeso(monthlyRevenue);

  // Weekly Revenue (last 7 days without mutating Date object)
  const startOfWeek = new Date();
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const weeklyRevenue = sales
    .filter((s) => {
      const d = s.timestamp ? new Date(s.timestamp) : null;
      return d && !isNaN(d.getTime()) && d >= startOfWeek;
    })
    .reduce((sum, s) => sum + (parseFloat(s.revenue) || 0), 0);
  const weeklyRevEl = document.getElementById("report-weekly-rev");
  if (weeklyRevEl) weeklyRevEl.textContent = formatPeso(weeklyRevenue);

  // Sales summary breakdown
  const summary = {};
  sales.forEach((s) => {
    const prodName = s.productName || "Unknown";
    if (!summary[prodName]) {
      summary[prodName] = { units: 0, revenue: 0 };
    }
    summary[prodName].units += Number(s.quantity) || 0;
    summary[prodName].revenue += parseFloat(s.revenue) || 0;
  });

  const sortedSummary = Object.entries(summary).sort((a, b) => b[1].units - a[1].units);
  const bestSeller = sortedSummary.length > 0 ? sortedSummary[0][0] : "N/A";
  const bestSellerEl = document.getElementById("report-best-seller");
  if (bestSellerEl) bestSellerEl.textContent = bestSeller;

  const tbody = document.getElementById("reports-table");
  if (tbody) {
    tbody.innerHTML = "";
    if (sortedSummary.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#94a3b8">No sales data recorded yet.</td></tr>`;
    } else {
      sortedSummary.forEach(([name, data]) => {
        tbody.innerHTML += `
          <tr>
            <td>${escapeHtml(name)}</td>
            <td>${data.units}</td>
            <td>${formatPeso(data.revenue)}</td>
          </tr>`;
      });
    }
  }
}

// ========================
// EMPLOYEES MANAGEMENT
// ========================
async function renderEmployees() {
  const employees = await fetchEmployees();
  const tbody = document.getElementById("employees-table");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#94a3b8">No employees found.</td></tr>`;
    return;
  }

  employees.forEach((e) => {
    const firstName = e.firstName || "";
    const middleName = e.middleName ? e.middleName.charAt(0) + "." : "";
    const lastName = e.lastName || "";
    tbody.innerHTML += `
      <tr data-id="${e.id}" onclick="selectEmployee(${e.id})" style="cursor:pointer">
        <td>${e.id}</td>
        <td>${escapeHtml(firstName)}</td>
        <td>${escapeHtml(middleName)}</td>
        <td>${escapeHtml(lastName)}</td>
        <td>${escapeHtml(e.gender || "Male")}</td>
        <td>${escapeHtml(e.role || "Cashier")}</td>
        <td>${escapeHtml(e.contact || "—")}</td>
        <td>${escapeHtml(e.email || "—")}</td>
        <td>${escapeHtml(e.dateHired || "—")}</td>
        <td>${escapeHtml(e.status || "Active")}</td>
      </tr>`;
  });
}

function selectEmployee(id) {
  const employee = employeesCache.find((e) => String(e.id) === String(id));
  if (!employee) return;

  document.getElementById("emp-id").value = employee.id;
  document.getElementById("emp-fname").value = employee.firstName || "";
  document.getElementById("emp-mname").value = employee.middleName || "";
  document.getElementById("emp-lname").value = employee.lastName || "";
  document.getElementById("emp-gender").value = employee.gender || "Male";
  document.getElementById("emp-dob").value = employee.dob || "";
  document.getElementById("emp-role").value = employee.role || "Cashier";
  document.getElementById("emp-contact").value = employee.contact || "";
  document.getElementById("emp-email").value = employee.email || "";
  document.getElementById("emp-datehired").value = employee.dateHired || "";
  document.getElementById("emp-status").value = employee.status || "Active";
  document.getElementById("emp-address").value = employee.address || "";
  document.getElementById("emp-emergname").value = employee.emergencyName || "";
  document.getElementById("emp-emergcontact").value = employee.emergencyContact || "";

  document.querySelectorAll("#employees-table tr").forEach((row) => {
    row.classList.toggle("selected", row.dataset.id === String(employee.id));
  });
}

function clearEmployeeForm() {
  document.getElementById("emp-id").value = "";
  document.getElementById("emp-fname").value = "";
  document.getElementById("emp-mname").value = "";
  document.getElementById("emp-lname").value = "";
  document.getElementById("emp-gender").value = "Male";
  document.getElementById("emp-dob").value = "";
  document.getElementById("emp-role").value = "Cashier";
  document.getElementById("emp-contact").value = "";
  document.getElementById("emp-email").value = "";
  document.getElementById("emp-datehired").value = "";
  document.getElementById("emp-status").value = "Active";
  document.getElementById("emp-address").value = "";
  document.getElementById("emp-emergname").value = "";
  document.getElementById("emp-emergcontact").value = "";
  document.querySelectorAll("#employees-table tr").forEach((row) => row.classList.remove("selected"));
}

async function saveEmployee() {
  const firstName = document.getElementById("emp-fname").value.trim();
  const middleName = document.getElementById("emp-mname").value.trim();
  const lastName = document.getElementById("emp-lname").value.trim();
  const gender = document.getElementById("emp-gender").value;
  const dob = document.getElementById("emp-dob").value;
  const role = document.getElementById("emp-role").value;
  const contact = document.getElementById("emp-contact").value.trim();
  const email = document.getElementById("emp-email").value.trim();
  const dateHired = document.getElementById("emp-datehired").value;
  const status = document.getElementById("emp-status").value;
  const address = document.getElementById("emp-address").value.trim();
  const emergencyName = document.getElementById("emp-emergname").value.trim();
  const emergencyContact = document.getElementById("emp-emergcontact").value.trim();

  if (!firstName || !lastName || !role || !contact) {
    alert("Please fill in First Name, Last Name, Role, and Contact.");
    return;
  }

  const empData = {
    id: Date.now(),
    firstName,
    middleName,
    lastName,
    gender,
    dob,
    role,
    contact,
    email,
    dateHired,
    status,
    address,
    emergencyName,
    emergencyContact,
  };

  const serverResult = await apiCall(`/employees`, "POST", empData);
  const emps = clientStore.getEmployees();
  emps.unshift(serverResult || empData);
  clientStore.set("cp_employees", emps);
  employeesCache = emps;

  showToast("Employee added successfully!");
  clearEmployeeForm();
  await renderEmployees();
}

async function updateEmployee() {
  const id = document.getElementById("emp-id").value;
  if (!id) {
    showToast("Please select an employee from the table to update.", "error");
    return;
  }

  const firstName = document.getElementById("emp-fname").value.trim();
  const middleName = document.getElementById("emp-mname").value.trim();
  const lastName = document.getElementById("emp-lname").value.trim();
  const gender = document.getElementById("emp-gender").value;
  const dob = document.getElementById("emp-dob").value;
  const role = document.getElementById("emp-role").value;
  const contact = document.getElementById("emp-contact").value.trim();
  const email = document.getElementById("emp-email").value.trim();
  const dateHired = document.getElementById("emp-datehired").value;
  const status = document.getElementById("emp-status").value;
  const address = document.getElementById("emp-address").value.trim();
  const emergencyName = document.getElementById("emp-emergname").value.trim();
  const emergencyContact = document.getElementById("emp-emergcontact").value.trim();

  if (!firstName || !lastName || !role || !contact) {
    showToast("Please fill in First Name, Last Name, Role, and Contact.", "error");
    return;
  }

  const empData = {
    firstName,
    middleName,
    lastName,
    gender,
    dob,
    role,
    contact,
    email,
    dateHired,
    status,
    address,
    emergencyName,
    emergencyContact,
  };

  await apiCall(`/employees/${id}`, "PUT", empData);
  const emps = clientStore.getEmployees();
  const index = emps.findIndex((e) => String(e.id) === String(id));
  if (index !== -1) {
    emps[index] = { ...emps[index], ...empData, id: Number(id) };
    clientStore.set("cp_employees", emps);
    employeesCache = emps;
  }

  showToast("Employee updated successfully!");
  clearEmployeeForm();
  await renderEmployees();
}

async function deleteEmployee() {
  const id = document.getElementById("emp-id").value;
  if (!id) {
    showToast("Please select an employee to delete.", "error");
    return;
  }
  if (!confirm("Are you sure you want to delete this employee?")) return;

  await apiCall(`/employees/${id}`, "DELETE");
  let emps = clientStore.getEmployees();
  emps = emps.filter((e) => String(e.id) !== String(id));
  clientStore.set("cp_employees", emps);
  employeesCache = emps;

  showToast("Employee deleted successfully!", "info");
  clearEmployeeForm();
  await renderEmployees();
}

// ========================
// USERS MANAGEMENT
// ========================
async function renderUsers() {
  const users = await fetchUsers();
  const tbody = document.getElementById("users-table");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#94a3b8">No users found.</td></tr>`;
    return;
  }

  users.forEach((u) => {
    const isSelf = currentUser && String(currentUser.id) === String(u.id);
    tbody.innerHTML += `
      <tr>
        <td>${u.id}</td>
        <td>${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.role)}</td>
        <td>
          ${
            isSelf
              ? `<span style="color:#94a3b8;font-size:12px">Current User</span>`
              : `<button type="button" onclick="deleteUser(${u.id})" style="background:#ef4444;color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;">Delete</button>`
          }
        </td>
      </tr>`;
  });
}

async function addUser() {
  const username = document.getElementById("new-username").value.trim();
  const password = document.getElementById("new-password").value.trim();
  const role = document.getElementById("new-role").value;

  if (!username || !password) {
    showToast("Please enter both username and password.", "error");
    return;
  }

  const userData = { id: Date.now(), username, password, role };
  await apiCall(`/users`, "POST", { username, password, role });
  const users = clientStore.getUsers();
  users.unshift(userData);
  clientStore.set("cp_users", users);

  document.getElementById("new-username").value = "";
  document.getElementById("new-password").value = "";
  showToast("User added successfully!");
  await renderUsers();
}

async function deleteUser(id) {
  if (!confirm("Are you sure you want to delete this user?")) return;
  await apiCall(`/users/${id}`, "DELETE");
  let users = clientStore.getUsers();
  users = users.filter((u) => String(u.id) !== String(id));
  clientStore.set("cp_users", users);

  showToast("User deleted successfully!", "info");
  await renderUsers();
}

// Utility: XSS prevention helper
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
