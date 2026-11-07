const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname, { etag: false, lastModified: false }));

// Prevent browser from caching old API data
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

// Redirect root to login page
app.get("/", (req, res) => {
  res.redirect("/login.html");
});

// Database Configuration (from environment variables or defaults)
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "minigrocery",
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
};

// 24 standard grocery products with at least 500 stocks each
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

// ============================================================
// DATA STORAGE (Supports MySQL or built-in JSON file storage)
// ============================================================
const dataFilePath = path.join(__dirname, "data.json");

let useMySQL = false;
let mysqlPool = null;

let memoryStore = {
  users: [{ id: 1, username: "admin", password: "admin123", role: "Admin" }],
  products: getDefaultProducts(),
  sales: [],
  stockins: [],
  employees: [],
};

function saveToFile() {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(memoryStore, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write to data.json:", err.message);
  }
}

function loadFromFile() {
  try {
    if (fs.existsSync(dataFilePath)) {
      const content = fs.readFileSync(dataFilePath, "utf8");
      const parsed = JSON.parse(content);
      memoryStore = {
        users: Array.isArray(parsed.users) && parsed.users.length ? parsed.users : memoryStore.users,
        products: Array.isArray(parsed.products) && parsed.products.length ? parsed.products : memoryStore.products,
        sales: Array.isArray(parsed.sales) ? parsed.sales : [],
        stockins: Array.isArray(parsed.stockins) ? parsed.stockins : [],
        employees: Array.isArray(parsed.employees) ? parsed.employees : [],
      };
      // Ensure all products have at least 500 stock
      memoryStore.products.forEach((p) => {
        if (!p.stock || p.stock < 500) p.stock = 500;
      });
    } else {
      saveToFile();
    }
  } catch (err) {
    console.warn("Could not read data.json, using defaults:", err.message);
    saveToFile();
  }
}

async function initMySQL() {
  // 1. Connect without database to create it if needed
  const connection = await mysql.createConnection({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    port: dbConfig.port,
    connectTimeout: 3000,
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
  await connection.end();

  // 2. Connect pool
  mysqlPool = mysql.createPool(dbConfig);
  await mysqlPool.query("SELECT 1");

  // 3. Create Tables
  await mysqlPool.query(`CREATE TABLE IF NOT EXISTS products (
    id BIGINT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    price DECIMAL(10,2) NOT NULL,
    stock INT DEFAULT 500,
    dateAdded VARCHAR(20)
  )`);

  await mysqlPool.query(`CREATE TABLE IF NOT EXISTS sales (
    id BIGINT PRIMARY KEY,
    productId BIGINT,
    productName VARCHAR(255),
    quantity INT,
    revenue DECIMAL(10,2),
    date VARCHAR(20),
    timestamp VARCHAR(50)
  )`);

  await mysqlPool.query(`CREATE TABLE IF NOT EXISTS stockins (
    id BIGINT PRIMARY KEY,
    productId BIGINT,
    productName VARCHAR(255),
    quantity INT,
    source VARCHAR(255),
    employeeName VARCHAR(255),
    date VARCHAR(20),
    timestamp VARCHAR(50)
  )`);

  await mysqlPool.query(`CREATE TABLE IF NOT EXISTS employees (
    id BIGINT PRIMARY KEY,
    firstName VARCHAR(100),
    middleName VARCHAR(100),
    lastName VARCHAR(100),
    gender VARCHAR(20),
    dob VARCHAR(20),
    role VARCHAR(50),
    contact VARCHAR(50),
    email VARCHAR(100),
    dateHired VARCHAR(20),
    status VARCHAR(20),
    address TEXT,
    emergencyName VARCHAR(100),
    emergencyContact VARCHAR(50)
  )`);

  await mysqlPool.query(`CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL
  )`);

  // Ensure default admin
  const [adminRows] = await mysqlPool.query("SELECT id FROM users WHERE username = 'admin'");
  if (adminRows.length === 0) {
    await mysqlPool.query("INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)", [
      1,
      "admin",
      "admin123",
      "Admin",
    ]);
  }

  // Ensure initial products with at least 500 stocks
  const [prodCount] = await mysqlPool.query("SELECT COUNT(*) AS count FROM products");
  if (prodCount[0].count === 0) {
    const defaultProds = getDefaultProducts();
    for (const item of defaultProds) {
      await mysqlPool.query(
        "INSERT INTO products (id, name, category, price, stock, dateAdded) VALUES (?, ?, ?, ?, ?, ?)",
        [item.id, item.name, item.category, item.price, item.stock, item.dateAdded],
      );
    }
  } else {
    await mysqlPool.query("UPDATE products SET stock = 500 WHERE stock < 500");
  }
}

// ============================================================
// DATA ACCESS LAYER (Works transparently with MySQL or JSON)
// ============================================================
const store = {
  // --- USERS & AUTH ---
  async findUser(username, password) {
    if (useMySQL) {
      const [rows] = await mysqlPool.query(
        "SELECT id, username, role FROM users WHERE username = ? AND password = ?",
        [username, password],
      );
      return rows[0] || null;
    }
    return (
      memoryStore.users.find(
        (u) => u.username === username && u.password === password,
      ) || null
    );
  },

  async getUsers() {
    if (useMySQL) {
      const [rows] = await mysqlPool.query(
        "SELECT id, username, role FROM users ORDER BY id DESC",
      );
      return rows;
    }
    return memoryStore.users.map(({ id, username, role }) => ({ id, username, role }));
  },

  async createUser(username, password, role) {
    if (useMySQL) {
      const [existing] = await mysqlPool.query("SELECT id FROM users WHERE username = ?", [username]);
      if (existing.length > 0) throw new Error("Username already exists");
      const id = Date.now();
      await mysqlPool.query("INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)", [
        id,
        username,
        password,
        role,
      ]);
      return { id, username, role };
    }
    if (memoryStore.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      throw new Error("Username already exists");
    }
    const newUser = { id: Date.now(), username, password, role };
    memoryStore.users.push(newUser);
    saveToFile();
    return { id: newUser.id, username: newUser.username, role: newUser.role };
  },

  async deleteUser(id) {
    if (useMySQL) {
      await mysqlPool.query("DELETE FROM users WHERE id = ?", [id]);
      return;
    }
    memoryStore.users = memoryStore.users.filter((u) => String(u.id) !== String(id));
    saveToFile();
  },

  // --- PRODUCTS ---
  async getProducts() {
    if (useMySQL) {
      const [rows] = await mysqlPool.query("SELECT * FROM products ORDER BY id DESC");
      return rows;
    }
    return [...memoryStore.products].reverse();
  },

  async createProduct({ name, category, price, stock }) {
    const id = Date.now();
    const dateAdded = new Date().toLocaleDateString("en-PH");
    const pStock = Number(stock) >= 500 ? Number(stock) : 500;
    const pPrice = Number(price);
    const pCategory = category || "General";

    if (useMySQL) {
      await mysqlPool.query(
        "INSERT INTO products (id, name, category, price, stock, dateAdded) VALUES (?, ?, ?, ?, ?, ?)",
        [id, name, pCategory, pPrice, pStock, dateAdded],
      );
      return { id, name, category: pCategory, price: pPrice, stock: pStock, dateAdded };
    }
    const product = { id, name, category: pCategory, price: pPrice, stock: pStock, dateAdded };
    memoryStore.products.push(product);
    saveToFile();
    return product;
  },

  async updateProduct(id, { name, category, price, stock }) {
    if (useMySQL) {
      const [existing] = await mysqlPool.query("SELECT * FROM products WHERE id = ?", [id]);
      if (existing.length === 0) return null;
      const cur = existing[0];
      const pName = typeof name !== "undefined" && name.trim() ? name.trim() : cur.name;
      const pCat = typeof category !== "undefined" && category.trim() ? category.trim() : cur.category;
      const pPrice = typeof price !== "undefined" && !isNaN(Number(price)) ? Number(price) : cur.price;
      const pStock = typeof stock !== "undefined" && !isNaN(Number(stock)) ? Number(stock) : cur.stock;
      await mysqlPool.query("UPDATE products SET name = ?, category = ?, price = ?, stock = ? WHERE id = ?", [
        pName,
        pCat,
        pPrice,
        pStock,
        id,
      ]);
      const [updated] = await mysqlPool.query("SELECT * FROM products WHERE id = ?", [id]);
      return updated[0];
    }
    const index = memoryStore.products.findIndex((p) => String(p.id) === String(id));
    if (index === -1) return null;
    const cur = memoryStore.products[index];
    cur.name = typeof name !== "undefined" && name.trim() ? name.trim() : cur.name;
    cur.category = typeof category !== "undefined" && category.trim() ? category.trim() : cur.category;
    cur.price = typeof price !== "undefined" && !isNaN(Number(price)) ? Number(price) : cur.price;
    cur.stock = typeof stock !== "undefined" && !isNaN(Number(stock)) ? Number(stock) : cur.stock;
    saveToFile();
    return cur;
  },

  async deleteProduct(id) {
    if (useMySQL) {
      await mysqlPool.query("DELETE FROM products WHERE id = ?", [id]);
      await mysqlPool.query("DELETE FROM sales WHERE productId = ?", [id]);
      await mysqlPool.query("DELETE FROM stockins WHERE productId = ?", [id]);
      return;
    }
    memoryStore.products = memoryStore.products.filter((p) => String(p.id) !== String(id));
    memoryStore.sales = memoryStore.sales.filter((s) => String(s.productId) !== String(id));
    memoryStore.stockins = memoryStore.stockins.filter((s) => String(s.productId) !== String(id));
    saveToFile();
  },

  // --- SALES (Deducts stock automatically) ---
  async getSales() {
    if (useMySQL) {
      const [rows] = await mysqlPool.query("SELECT * FROM sales ORDER BY id DESC");
      return rows;
    }
    return [...memoryStore.sales].reverse();
  },

  async createSale({ productId, quantity }) {
    const qty = parseInt(quantity, 10);
    if (!productId || isNaN(qty) || qty <= 0) {
      throw new Error("Please enter a valid quantity greater than zero.");
    }

    if (useMySQL) {
      const [products] = await mysqlPool.query("SELECT * FROM products WHERE id = ?", [productId]);
      if (products.length === 0) throw new Error("Product not found");
      const product = products[0];
      if (product.stock < qty) {
        throw new Error(`Insufficient stock. Only ${product.stock} available.`);
      }
      const revenue = parseFloat((qty * Number(product.price)).toFixed(2));
      const sale = {
        id: Date.now(),
        productId: product.id,
        productName: product.name,
        quantity: qty,
        revenue,
        date: new Date().toLocaleDateString("en-PH"),
        timestamp: new Date().toISOString(),
      };
      await mysqlPool.query(
        "INSERT INTO sales (id, productId, productName, quantity, revenue, date, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [sale.id, sale.productId, sale.productName, sale.quantity, sale.revenue, sale.date, sale.timestamp],
      );
      // Deduct stock
      await mysqlPool.query("UPDATE products SET stock = stock - ? WHERE id = ?", [qty, product.id]);
      return sale;
    }

    const product = memoryStore.products.find((p) => String(p.id) === String(productId));
    if (!product) throw new Error("Product not found");
    if (product.stock < qty) {
      throw new Error(`Insufficient stock. Only ${product.stock} available.`);
    }

    const revenue = parseFloat((qty * Number(product.price)).toFixed(2));
    const sale = {
      id: Date.now(),
      productId: product.id,
      productName: product.name,
      quantity: qty,
      revenue,
      date: new Date().toLocaleDateString("en-PH"),
      timestamp: new Date().toISOString(),
    };

    // Deduct stock from product
    product.stock -= qty;
    memoryStore.sales.push(sale);
    saveToFile();
    return sale;
  },

  // --- STOCK IN (Adds stock automatically) ---
  async getStockins() {
    if (useMySQL) {
      const [rows] = await mysqlPool.query("SELECT * FROM stockins ORDER BY id DESC");
      return rows;
    }
    return [...memoryStore.stockins].reverse();
  },

  async createStockin({ name, category, price, quantity, source, employeeName }) {
    const qty = parseInt(quantity, 10);
    const pPrice = parseFloat(price);
    if (!name || isNaN(pPrice) || isNaN(qty) || qty <= 0) {
      throw new Error("Product name, valid price, and quantity to add are required.");
    }

    if (useMySQL) {
      let [products] = await mysqlPool.query(
        "SELECT * FROM products WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))",
        [name],
      );
      let productId;
      if (products.length > 0) {
        productId = products[0].id;
        await mysqlPool.query("UPDATE products SET price = ?, category = ?, stock = stock + ? WHERE id = ?", [
          pPrice,
          category || products[0].category || "General",
          qty,
          productId,
        ]);
      } else {
        productId = Date.now();
        const dateAdded = new Date().toLocaleDateString("en-PH");
        await mysqlPool.query(
          "INSERT INTO products (id, name, category, price, stock, dateAdded) VALUES (?, ?, ?, ?, ?, ?)",
          [productId, name.trim(), category || "General", pPrice, 500 + qty, dateAdded],
        );
      }
      const stockin = {
        id: Date.now(),
        productId,
        productName: name.trim(),
        quantity: qty,
        source: source || "General Supplier",
        employeeName: employeeName || "Unknown",
        date: new Date().toLocaleDateString("en-PH"),
        timestamp: new Date().toISOString(),
      };
      await mysqlPool.query(
        "INSERT INTO stockins (id, productId, productName, quantity, source, employeeName, date, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [stockin.id, stockin.productId, stockin.productName, stockin.quantity, stockin.source, stockin.employeeName, stockin.date, stockin.timestamp],
      );
      return stockin;
    }

    let product = memoryStore.products.find(
      (p) => p.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    let productId;
    if (product) {
      productId = product.id;
      product.price = pPrice;
      if (category) product.category = category;
      product.stock += qty;
    } else {
      productId = Date.now();
      product = {
        id: productId,
        name: name.trim(),
        category: category || "General",
        price: pPrice,
        stock: 500 + qty,
        dateAdded: new Date().toLocaleDateString("en-PH"),
      };
      memoryStore.products.push(product);
    }

    const stockin = {
      id: Date.now(),
      productId,
      productName: name.trim(),
      quantity: qty,
      source: source || "General Supplier",
      employeeName: employeeName || "Unknown",
      date: new Date().toLocaleDateString("en-PH"),
      timestamp: new Date().toISOString(),
    };
    memoryStore.stockins.push(stockin);
    saveToFile();
    return stockin;
  },

  // --- EMPLOYEES ---
  async getEmployees() {
    if (useMySQL) {
      const [rows] = await mysqlPool.query("SELECT * FROM employees ORDER BY id DESC");
      return rows;
    }
    return [...memoryStore.employees].reverse();
  },

  async createEmployee(data) {
    const id = Date.now();
    const employee = {
      id,
      firstName: data.firstName || "",
      middleName: data.middleName || "",
      lastName: data.lastName || "",
      gender: data.gender || "Male",
      dob: data.dob || "",
      role: data.role || "Cashier",
      contact: data.contact || "",
      email: data.email || "",
      dateHired: data.dateHired || "",
      status: data.status || "Active",
      address: data.address || "",
      emergencyName: data.emergencyName || "",
      emergencyContact: data.emergencyContact || "",
    };
    if (useMySQL) {
      await mysqlPool.query(
        `INSERT INTO employees (id, firstName, middleName, lastName, gender, dob, role, contact, email, dateHired, status, address, emergencyName, emergencyContact) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          employee.id,
          employee.firstName,
          employee.middleName,
          employee.lastName,
          employee.gender,
          employee.dob,
          employee.role,
          employee.contact,
          employee.email,
          employee.dateHired,
          employee.status,
          employee.address,
          employee.emergencyName,
          employee.emergencyContact,
        ],
      );
      return employee;
    }
    memoryStore.employees.push(employee);
    saveToFile();
    return employee;
  },

  async updateEmployee(id, data) {
    if (useMySQL) {
      await mysqlPool.query(
        `UPDATE employees SET firstName=?, middleName=?, lastName=?, gender=?, dob=?, role=?, contact=?, email=?, dateHired=?, status=?, address=?, emergencyName=?, emergencyContact=? WHERE id=?`,
        [
          data.firstName || "",
          data.middleName || "",
          data.lastName || "",
          data.gender || "Male",
          data.dob || "",
          data.role || "Cashier",
          data.contact || "",
          data.email || "",
          data.dateHired || "",
          data.status || "Active",
          data.address || "",
          data.emergencyName || "",
          data.emergencyContact || "",
          id,
        ],
      );
      const [rows] = await mysqlPool.query("SELECT * FROM employees WHERE id = ?", [id]);
      return rows[0] || {};
    }
    const index = memoryStore.employees.findIndex((e) => String(e.id) === String(id));
    if (index === -1) return null;
    memoryStore.employees[index] = { ...memoryStore.employees[index], ...data, id: Number(id) };
    saveToFile();
    return memoryStore.employees[index];
  },

  async deleteEmployee(id) {
    if (useMySQL) {
      await mysqlPool.query("DELETE FROM employees WHERE id = ?", [id]);
      return;
    }
    memoryStore.employees = memoryStore.employees.filter((e) => String(e.id) !== String(id));
    saveToFile();
  },
};

// ============================================================
// EXPRESS API ROUTES
// ============================================================

// Users & Auth
app.get("/users", async (req, res) => {
  try {
    const users = await store.getUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Username and password are required" });
    }
    const user = await store.findUser(username, password);
    if (user) {
      res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
    } else {
      res.status(401).json({ success: false, error: "Invalid username or password" });
    }
  } catch (err) {
    console.error("Login Error:", err.message);
    res.status(500).json({ success: false, error: "Login failed: " + err.message });
  }
});

app.post("/users", async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ error: "Username, password, and role are required" });
    }
    const user = await store.createUser(username, password, role);
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/users/:id", async (req, res) => {
  try {
    await store.deleteUser(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Products
app.get("/products", async (req, res) => {
  try {
    const products = await store.getProducts();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/products", async (req, res) => {
  try {
    const { name, category, price, stock } = req.body;
    const pPrice = parseFloat(price);
    if (!name || isNaN(pPrice) || pPrice < 0) {
      return res.status(400).json({ error: "Valid product name and price are required." });
    }
    const product = await store.createProduct({ name: name.trim(), category, price: pPrice, stock });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/products/:id", async (req, res) => {
  try {
    const updated = await store.updateProduct(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Product not found" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/products/:id", async (req, res) => {
  try {
    await store.deleteProduct(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sales
app.get("/sales", async (req, res) => {
  try {
    const sales = await store.getSales();
    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/sales", async (req, res) => {
  try {
    const sale = await store.createSale(req.body);
    res.json(sale);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Stock In
app.get("/stockins", async (req, res) => {
  try {
    const stockins = await store.getStockins();
    res.json(stockins);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/stockins", async (req, res) => {
  try {
    const stockin = await store.createStockin(req.body);
    res.json(stockin);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Employees
app.get("/employees", async (req, res) => {
  try {
    const employees = await store.getEmployees();
    res.json(employees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/employees", async (req, res) => {
  try {
    const employee = await store.createEmployee(req.body);
    res.json(employee);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/employees/:id", async (req, res) => {
  try {
    const employee = await store.updateEmployee(req.params.id, req.body);
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    res.json(employee);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/employees/:id", async (req, res) => {
  try {
    await store.deleteEmployee(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// START SERVER
// ============================================================
async function startServer() {
  try {
    console.log("Checking MySQL connection...");
    await initMySQL();
    useMySQL = true;
    console.log(`Connected to MySQL Database (${dbConfig.database}).`);
  } catch (err) {
    useMySQL = false;
    console.log("Notice: MySQL not detected (" + err.message + ").");
    console.log("Activating built-in persistent JSON storage (data.json).");
    loadFromFile();
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`CornerPantry POS server running at http://0.0.0.0:${PORT}`);
    console.log(`Storage engine: ${useMySQL ? "MySQL Database" : "Built-in JSON (data.json)"}`);
  });
}

startServer();
