const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname, { etag: false, lastModified: false }));

// No-cache headers
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

// Database Configuration
const dbConfig = {
  host: "localhost",
  user: "root",
  password: "",
  database: "minigrocery",
  waitForConnections: true,
  connectionLimit: 10,
};

let db;

async function initDB() {
  try {
    // 1. Connect without database to ensure it exists
    const connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
    });

    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``,
    );
    await connection.end();

    // 2. Connect to pool
    db = mysql.createPool(dbConfig);
    await db.query("SELECT 1");
    console.log(`Connected to MySQL Database (${dbConfig.database}).`);

    // 3. Create Tables
    const tables = [
      `CREATE TABLE IF NOT EXISTS products (
        id BIGINT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        price DECIMAL(10,2) NOT NULL,
        stock INT DEFAULT 500,
        dateAdded VARCHAR(20)
      )`,
      `CREATE TABLE IF NOT EXISTS sales (
        id BIGINT PRIMARY KEY,
        productId BIGINT,
        productName VARCHAR(255),
        quantity INT,
        revenue DECIMAL(10,2),
        date VARCHAR(20),
        timestamp VARCHAR(100)
      )`,
      `CREATE TABLE IF NOT EXISTS stockins (
        id BIGINT PRIMARY KEY,
        productId BIGINT,
        productName VARCHAR(255),
        quantity INT,
        source VARCHAR(255),
        employeeName VARCHAR(255),
        date VARCHAR(20),
        timestamp VARCHAR(100)
      )`,
      `CREATE TABLE IF NOT EXISTS employees (
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
        status VARCHAR(50),
        address TEXT,
        emergencyName VARCHAR(255),
        emergencyContact VARCHAR(50)
      )`,
      `CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL
      )`,
    ];

    for (const sql of tables) {
      await db.query(sql);
    }

    // 4. Create Triggers
    // Trigger 1: Subtract stock on sale
    await db.query("DROP TRIGGER IF EXISTS after_sales_insert");
    await db.query(`
      CREATE TRIGGER after_sales_insert
      AFTER INSERT ON sales
      FOR EACH ROW
      BEGIN
        UPDATE products SET stock = stock - NEW.quantity WHERE id = NEW.productId;
      END
    `);

    // Trigger 2: Add stock on restock
    await db.query("DROP TRIGGER IF EXISTS after_stockin_insert");
    await db.query(`
      CREATE TRIGGER after_stockin_insert
      AFTER INSERT ON stockins
      FOR EACH ROW
      BEGIN
        UPDATE products SET stock = stock + NEW.quantity WHERE id = NEW.productId;
      END
    `);

    // Trigger 3: Cleanup on product deletion
    await db.query("DROP TRIGGER IF EXISTS after_product_delete");
    await db.query(`
      CREATE TRIGGER after_product_delete
      AFTER DELETE ON products
      FOR EACH ROW
      BEGIN
        DELETE FROM sales WHERE productId = OLD.id;
        DELETE FROM stockins WHERE productId = OLD.id;
      END
    `);

    // 5. Create Views
    await db.query("DROP VIEW IF EXISTS view_product_sales");
    await db.query(`
      CREATE VIEW view_product_sales AS
      SELECT p.id, p.name, COALESCE(SUM(s.quantity), 0) AS total_sold, COALESCE(SUM(s.revenue), 0) AS total_revenue
      FROM products p
      LEFT JOIN sales s ON p.id = s.productId
      GROUP BY p.id, p.name
    `);

    await db.query("DROP VIEW IF EXISTS view_low_quantity");
    await db.query(`
      CREATE VIEW view_low_quantity AS
      SELECT id, name, stock, category
      FROM products
      WHERE stock <= 5
    `);

    await db.query("DROP VIEW IF EXISTS view_daily_report");
    await db.query(`
      CREATE VIEW view_daily_report AS
      SELECT date, SUM(revenue) AS daily_total
      FROM sales
      GROUP BY date
    `);

    // 6. Ensure default admin user exists
    const [adminRows] = await db.query(
      "SELECT id FROM users WHERE username = 'admin'",
    );
    if (adminRows.length === 0) {
      await db.query(
        "INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)",
        [Date.now(), "admin", "admin123", "Admin"],
      );
      console.log("Default admin account created: admin / admin123");
    }

    // 7. Seed products with at least 500 stocks if products table is empty, or ensure existing products have at least 500 stock
    const [prodCount] = await db.query("SELECT COUNT(*) AS count FROM products");
    if (prodCount[0].count === 0) {
      const initialProducts = [
        { name: "Rice (1kg)", category: "Grains, Pasta & Staples", price: 58, stock: 500 },
        { name: "Eggs (1 tray)", category: "Dairy & Eggs", price: 180, stock: 500 },
        { name: "Milk (1L)", category: "Dairy & Eggs", price: 85, stock: 500 },
        { name: "Bread (Loaf)", category: "Bakery & Bread", price: 65, stock: 500 },
        { name: "Canned Tuna", category: "Canned & Packed Goods", price: 35, stock: 500 },
        { name: "Instant Noodles", category: "Canned & Packed Goods", price: 15, stock: 500 },
        { name: "Cooking Oil (1L)", category: "Grains, Pasta & Staples", price: 125, stock: 500 },
        { name: "Sugar (1kg)", category: "Grains, Pasta & Staples", price: 68, stock: 500 },
        { name: "Salt (1kg)", category: "Grains, Pasta & Staples", price: 20, stock: 500 },
        { name: "Coffee (200g)", category: "Beverages", price: 95, stock: 500 },
        { name: "Vinegar (1L)", category: "Condiments & Spices", price: 30, stock: 500 },
        { name: "Soy Sauce (1L)", category: "Condiments & Spices", price: 40, stock: 500 },
        { name: "Canned Sardines", category: "Canned & Packed Goods", price: 22, stock: 500 },
        { name: "Garlic (250g)", category: "Fresh Produce", price: 25, stock: 500 },
        { name: "Onion (1kg)", category: "Fresh Produce", price: 60, stock: 500 },
        { name: "Tomato (1kg)", category: "Fresh Produce", price: 50, stock: 500 },
        { name: "Butter (225g)", category: "Dairy & Eggs", price: 110, stock: 500 },
        { name: "Cheese (165g)", category: "Dairy & Eggs", price: 75, stock: 500 },
        { name: "Shampoo (180ml)", category: "Health & Beauty", price: 90, stock: 500 },
        { name: "Laundry Soap", category: "Cleaning Supplies", price: 18, stock: 500 },
        { name: "Potato Chips (Large)", category: "Snacks & Sweets", price: 95, stock: 500 },
        { name: "Corn Chips (Small)", category: "Snacks & Sweets", price: 15, stock: 500 },
        { name: "Chocolate Bar", category: "Snacks & Sweets", price: 35, stock: 500 },
        { name: "Biscuit Pack", category: "Snacks & Sweets", price: 55, stock: 500 },
      ];

      const dateAdded = new Date().toLocaleDateString("en-PH");
      let baseId = Date.now();
      for (const item of initialProducts) {
        await db.query(
          "INSERT INTO products (id, name, category, price, stock, dateAdded) VALUES (?, ?, ?, ?, ?, ?)",
          [baseId++, item.name, item.category, item.price, item.stock, dateAdded],
        );
      }
      console.log("Seeded standard products with at least 500 stocks each.");
    } else {
      await db.query("UPDATE products SET stock = 500 WHERE stock < 500");
    }

    console.log("Database initialized successfully.");
  } catch (error) {
    console.error("Database initialization failed:", error.message);
    throw error;
  }
}

// ========================
// USERS & AUTH
// ========================
app.get("/users", async (req, res) => {
  try {
    const [users] = await db.query("SELECT id, username, role FROM users ORDER BY id DESC");
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
    const [users] = await db.query(
      "SELECT id, username, role FROM users WHERE username = ? AND password = ?",
      [username, password],
    );
    if (users.length > 0) {
      res.json({ success: true, user: users[0] });
    } else {
      res.status(401).json({ success: false, error: "Invalid username or password" });
    }
  } catch (err) {
    console.error("Login Error:", err.message);
    res.status(500).json({
      success: false,
      error: "Database error: " + (err.message || "Unknown error"),
    });
  }
});

app.post("/users", async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ error: "Username, password, and role are required" });
    }
    const [existing] = await db.query("SELECT id FROM users WHERE username = ?", [username]);
    if (existing.length > 0) {
      return res.status(400).json({ error: "Username already exists" });
    }
    const id = Date.now();
    await db.query(
      "INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)",
      [id, username, password, role],
    );
    res.json({ id, username, role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/users/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM users WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// PRODUCTS
// ========================
app.get("/products", async (req, res) => {
  try {
    const [products] = await db.query("SELECT * FROM products ORDER BY id DESC");
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/products", async (req, res) => {
  try {
    const { name, category, price, stock } = req.body;
    const pPrice = parseFloat(price);
    const parsedStock = parseInt(stock, 10);
    const pStock = isNaN(parsedStock) || parsedStock < 500 ? 500 : parsedStock;

    if (!name || isNaN(pPrice) || pPrice < 0) {
      return res.status(400).json({ error: "Valid product name and price are required." });
    }
    const id = Date.now();
    const dateAdded = new Date().toLocaleDateString("en-PH");
    await db.query(
      "INSERT INTO products (id, name, category, price, stock, dateAdded) VALUES (?, ?, ?, ?, ?, ?)",
      [id, name.trim(), category || "General", pPrice, pStock, dateAdded],
    );
    res.json({ id, name: name.trim(), category: category || "General", price: pPrice, stock: pStock, dateAdded });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/products/:id", async (req, res) => {
  try {
    const { name, category, price, stock } = req.body;
    const { id } = req.params;
    const [existingProducts] = await db.query(
      "SELECT * FROM products WHERE id = ?",
      [id],
    );
    if (existingProducts.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const current = existingProducts[0];
    const pName = typeof name !== "undefined" && name.trim() ? name.trim() : current.name;
    const pCat = typeof category !== "undefined" && category.trim() ? category.trim() : current.category;
    const pPrice = typeof price !== "undefined" && !isNaN(parseFloat(price)) ? parseFloat(price) : current.price;
    const pStock = typeof stock !== "undefined" && !isNaN(parseInt(stock, 10)) ? parseInt(stock, 10) : current.stock;

    await db.query(
      "UPDATE products SET name = ?, category = ?, price = ?, stock = ? WHERE id = ?",
      [pName, pCat, pPrice, pStock, id],
    );
    const [products] = await db.query("SELECT * FROM products WHERE id = ?", [id]);
    res.json(products[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/products/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM products WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// SALES (Stock is automatically deducted)
// ========================
app.get("/sales", async (req, res) => {
  try {
    const [sales] = await db.query("SELECT * FROM sales ORDER BY id DESC");
    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/sales", async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const qty = parseInt(quantity, 10);

    if (!productId || isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: "Please enter a valid quantity greater than zero." });
    }

    const [products] = await db.query("SELECT * FROM products WHERE id = ?", [productId]);
    if (products.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const product = products[0];

    if (product.stock < qty) {
      return res.status(400).json({ error: `Insufficient stock. Only ${product.stock} available.` });
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

    // Insert sale record
    await db.query(
      "INSERT INTO sales (id, productId, productName, quantity, revenue, date, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        sale.id,
        sale.productId,
        sale.productName,
        sale.quantity,
        sale.revenue,
        sale.date,
        sale.timestamp,
      ],
    );

    // Verify stock deduction in case MySQL trigger was skipped in host environment
    const [chk] = await db.query("SELECT stock FROM products WHERE id = ?", [product.id]);
    if (chk.length > 0 && chk[0].stock === product.stock) {
      await db.query("UPDATE products SET stock = stock - ? WHERE id = ?", [qty, product.id]);
    }

    res.json(sale);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========================
// STOCK IN
// ========================
app.get("/stockins", async (req, res) => {
  try {
    const [stockins] = await db.query(
      "SELECT * FROM stockins ORDER BY id DESC",
    );
    res.json(stockins);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/stockins", async (req, res) => {
  try {
    const { name, category, price, quantity, source, employeeName } = req.body;
    const qty = parseInt(quantity, 10);
    const pPrice = parseFloat(price);

    if (!name || isNaN(pPrice) || isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: "Product name, valid price, and quantity to add are required." });
    }

    let [products] = await db.query(
      "SELECT * FROM products WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))",
      [name],
    );
    let productId;
    let initialStock = 0;

    if (products.length > 0) {
      productId = products[0].id;
      initialStock = products[0].stock;
      await db.query(
        "UPDATE products SET price = ?, category = ? WHERE id = ?",
        [pPrice, category || products[0].category || "General", productId],
      );
    } else {
      productId = Date.now();
      const dateAdded = new Date().toLocaleDateString("en-PH");
      await db.query(
        "INSERT INTO products (id, name, category, price, stock, dateAdded) VALUES (?, ?, ?, ?, 500, ?)",
        [productId, name.trim(), category || "General", pPrice, dateAdded],
      );
      initialStock = 500;
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

    await db.query(
      "INSERT INTO stockins (id, productId, productName, quantity, source, employeeName, date, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        stockin.id,
        stockin.productId,
        stockin.productName,
        stockin.quantity,
        stockin.source,
        stockin.employeeName,
        stockin.date,
        stockin.timestamp,
      ],
    );

    // Verify stock addition in case trigger was skipped
    const [chk] = await db.query("SELECT stock FROM products WHERE id = ?", [productId]);
    if (chk.length > 0 && chk[0].stock === initialStock) {
      await db.query("UPDATE products SET stock = stock + ? WHERE id = ?", [qty, productId]);
    }

    res.json(stockin);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========================
// EMPLOYEES
// ========================
app.get("/employees", async (req, res) => {
  try {
    const [employees] = await db.query("SELECT * FROM employees ORDER BY id DESC");
    res.json(employees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/employees", async (req, res) => {
  try {
    const data = req.body;
    const id = Date.now();
    await db.query(
      `INSERT INTO employees (id, firstName, middleName, lastName, gender, dob, role, contact, email, dateHired, status, address, emergencyName, emergencyContact) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
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
      ],
    );
    res.json({ id, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/employees/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    await db.query(
      "UPDATE employees SET firstName = ?, middleName = ?, lastName = ?, gender = ?, dob = ?, role = ?, contact = ?, email = ?, dateHired = ?, status = ?, address = ?, emergencyName = ?, emergencyContact = ? WHERE id = ?",
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
    const [employees] = await db.query("SELECT * FROM employees WHERE id = ?", [
      id,
    ]);
    res.json(employees[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/employees/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM employees WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server after DB initialization
initDB()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log("Grocery POS server running at http://127.0.0.1:" + PORT);
    });
  })
  .catch((err) => {
    console.error("Failed to start server:", err.message);
  });
