require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

// ==================== HELPERS ====================

// Safe parsing of facilities - handles both JSON and comma-separated formats
function safeParseFacilities(facilitiesData) {
    if (!facilitiesData) return [];
    
    if (Array.isArray(facilitiesData)) return facilitiesData;
    
    if (typeof facilitiesData === 'string') {
        if (facilitiesData.trim().startsWith('[')) {
            try {
                return JSON.parse(facilitiesData);
            } catch (e) {
                // Parsing failed, fall through to comma-separated
            }
        }
        
        return facilitiesData
            .split(',')
            .map(f => f.trim())
            .filter(f => f.length > 0);
    }
    
    return [];
}

// ==================== MIDDLEWARE ====================

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ==================== JWT HELPERS ====================

function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: "7d" }
    );
}

function verifyToken(req, res, next) {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
        return res.status(401).json({ message: "Token required" });
    }

    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}

function requireRole(roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                message: `Access denied. Required roles: ${roles.join(", ")}`
            });
        }

        next();
    };
}

// ==================== AUTH ENDPOINTS ====================

// SIGNUP
app.post("/api/auth/signup", async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password || !role) {
            return res.status(400).json({ message: "All fields required" });
        }

        const conn = await pool.getConnection();

        // Check if email already exists
        const [existing] = await conn.query(
            "SELECT id FROM users WHERE email = ?",
            [email.toLowerCase()]
        );

        if (existing.length > 0) {
            conn.release();
            return res.status(409).json({ message: "Email already exists" });
        }

        // Insert new user
        const [result] = await conn.query(
            "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
            [name, email.toLowerCase(), password, role]
        );

        conn.release();

        const user = {
            id: result.insertId,
            name,
            email,
            role
        };

        res.status(201).json({
            token: generateToken(user),
            role: user.role,
            user
        });
    } catch (error) {
        console.error("❌ Signup error:", error);
        res.status(500).json({ error: error.message });
    }
});

// LOGIN
app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const conn = await pool.getConnection();

        const [rows] = await conn.query(
            "SELECT id, name, email, password, role FROM users WHERE email = ?",
            [email.toLowerCase()]
        );

        conn.release();

        if (rows.length === 0 || rows[0].password !== password) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const user = rows[0];

        res.json({
            token: generateToken(user),
            role: user.role,
            user: { id: user.id, name: user.name, email: user.email }
        });
    } catch (error) {
        console.error("❌ Login error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== OWNER ENDPOINTS ====================

// ADD NEW PG
app.post(
    "/api/pg/add",
    verifyToken,
    requireRole(["owner"]),
    async (req, res) => {
        try {
            const {
                pgName,
                pgRent,
                pgAddress,
                pgCity,
                pgPincode,
                pgDistance,
                pgCollege,
                pgRoomType,
                pgGender,
                pgDeposit,
                facilities,
                pgDescription
            } = req.body;

            // Validation
            if (!pgName || !pgRent || !pgAddress || !pgCity || !pgPincode || !pgDistance) {
                return res.status(400).json({ message: "Missing required fields" });
            }

            const conn = await pool.getConnection();

            // ✅ CORRECT: Stringify facilities ONCE
            const facilitiesJSON = Array.isArray(facilities)
                ? JSON.stringify(facilities)
                : JSON.stringify([]);

            console.log("✅ Facilities being saved:", facilitiesJSON);

            const [result] = await conn.query(
                `INSERT INTO pgs
                (owner_id, name, rent, address, city, pincode, distance, college,
                room_type, gender, deposit, facilities, description, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
                [
                    req.user.id,
                    pgName,
                    pgRent,
                    pgAddress,
                    pgCity,
                    pgPincode,
                    pgDistance,
                    pgCollege,
                    pgRoomType,
                    pgGender,
                    pgDeposit,
                    facilitiesJSON,
                    pgDescription
                ]
            );

            conn.release();

            console.log("✅ PG added successfully with ID:", result.insertId);

            res.status(201).json({
                message: "PG submitted for approval",
                pgId: result.insertId,
                status: "pending"
            });
        } catch (error) {
            console.error("❌ Error adding PG:", error);
            res.status(500).json({ error: error.message });
        }
    }
);

// LIST OWNER'S PGs
app.get(
    "/api/owner/pgs",
    verifyToken,
    requireRole(["owner"]),
    async (req, res) => {
        try {
            const conn = await pool.getConnection();

            const [rows] = await conn.query(
                "SELECT * FROM pgs WHERE owner_id = ? ORDER BY created_at DESC",
                [req.user.id]
            );

            conn.release();

            const pgs = rows.map(pg => ({
                ...pg,
                facilities: pg.facilities ? safeParseFacilities(pg.facilities) : []
            }));

            res.json({ listings: pgs });
        } catch (error) {
            console.error("❌ Error fetching owner PGs:", error);
            res.status(500).json({ error: error.message });
        }
    }
);

// ==================== ADMIN ENDPOINTS ====================

// GET PENDING PGs
app.get(
    "/api/admin/pgs/pending",
    verifyToken,
    requireRole(["admin"]),
    async (req, res) => {
        try {
            console.log("✅ [1] Request received for /api/admin/pgs/pending");
            console.log("✅ [2] User authenticated:", req.user.id);

            const conn = await pool.getConnection();

            console.log("✅ [3] Database connection obtained");

            const [rows] = await conn.query(
                `SELECT p.id, p.name, p.rent, p.address, p.city, p.distance,
                p.status, p.created_at, u.name as owner_name, u.email as owner_email,
                p.facilities
                FROM pgs p
                JOIN users u ON p.owner_id = u.id
                WHERE p.status = 'pending'
                ORDER BY p.created_at DESC`
            );

            console.log("✅ [4] Query executed, found:", rows.length, "pending PGs");

            conn.release();

            console.log("✅ [5] Database connection released");

            const pgs = rows.map(pg => ({
                ...pg,
                facilities: pg.facilities ? safeParseFacilities(pg.facilities) : []
            }));

            console.log("✅ [6] Response ready, sending...");

            res.json({ total: pgs.length, listings: pgs });

            console.log("✅ [7] Response sent successfully");
        } catch (error) {
            console.error("❌ Error fetching pending PGs:");
            console.error("Message:", error.message);
            console.error("Code:", error.code);
            console.error("Full error:", error);

            res.status(500).json({ error: error.message });
        }
    }
);

// GET ALL PGs (any status)
app.get(
    "/api/admin/pgs",
    verifyToken,
    requireRole(["admin"]),
    async (req, res) => {
        try {
            const conn = await pool.getConnection();

            const [rows] = await conn.query(
                `SELECT p.id, p.name, p.rent, p.address, p.city, p.distance,
                p.status, p.created_at, u.name as owner_name, u.email as owner_email,
                p.facilities
                FROM pgs p
                JOIN users u ON p.owner_id = u.id
                ORDER BY p.status ASC, p.created_at DESC`
            );

            conn.release();

            const pgs = rows.map(pg => ({
                ...pg,
                facilities: pg.facilities ? safeParseFacilities(pg.facilities) : []
            }));

            res.json({ total: pgs.length, listings: pgs });
        } catch (error) {
            console.error("❌ Error fetching admin PGs:", error);
            res.status(500).json({ error: error.message });
        }
    }
);

// APPROVE PG
app.patch(
    "/api/admin/pgs/:pgId/approve",
    verifyToken,
    requireRole(["admin"]),
    async (req, res) => {
        try {
            const { pgId } = req.params;

            const conn = await pool.getConnection();

            const [result] = await conn.query(
                "UPDATE pgs SET status = 'approved' WHERE id = ?",
                [pgId]
            );

            conn.release();

            if (result.affectedRows === 0) {
                return res.status(404).json({ message: "PG not found" });
            }

            console.log("✅ PG approved:", pgId);

            res.json({
                message: "PG approved successfully",
                pgId,
                status: "approved"
            });
        } catch (error) {
            console.error("❌ Error approving PG:", error);
            res.status(500).json({ error: error.message });
        }
    }
);

// REJECT PG
app.patch(
    "/api/admin/pgs/:pgId/reject",
    verifyToken,
    requireRole(["admin"]),
    async (req, res) => {
        try {
            const { pgId } = req.params;

            const conn = await pool.getConnection();

            const [result] = await conn.query(
                "UPDATE pgs SET status = 'rejected' WHERE id = ?",
                [pgId]
            );

            conn.release();

            if (result.affectedRows === 0) {
                return res.status(404).json({ message: "PG not found" });
            }

            console.log("✅ PG rejected:", pgId);

            res.json({
                message: "PG rejected successfully",
                pgId,
                status: "rejected"
            });
        } catch (error) {
            console.error("❌ Error rejecting PG:", error);
            res.status(500).json({ error: error.message });
        }
    }
);

// ==================== STUDENT ENDPOINTS ====================

// GET APPROVED PGs WITH FILTERS (PUBLIC)
app.get("/api/pgs", async (req, res) => {
    try {
        const { minPrice, maxPrice, maxDistance, facilities } = req.query;

        let query = `
            SELECT id, name, rent, address, city, distance, college,
            room_type, gender, deposit, facilities, description, created_at
            FROM pgs
            WHERE status = 'approved'
        `;

        const params = [];

        if (minPrice) {
            query += " AND rent >= ?";
            params.push(minPrice);
        }

        if (maxPrice) {
            query += " AND rent <= ?";
            params.push(maxPrice);
        }

        if (maxDistance) {
            query += " AND distance <= ?";
            params.push(maxDistance);
        }

        if (facilities) {
            const facilityList = facilities.split(",").map(f => f.trim());
            facilityList.forEach(f => {
                query += " AND JSON_CONTAINS(facilities, JSON_QUOTE(?))";
                params.push(f);
            });
        }

        query += " ORDER BY distance ASC";

        const conn = await pool.getConnection();

        const [rows] = await conn.query(query, params);

        conn.release();

        const pgs = rows.map(pg => ({
            ...pg,
            facilities: pg.facilities ? safeParseFacilities(pg.facilities) : []
        }));

        res.json({ total: pgs.length, listings: pgs });
    } catch (error) {
        console.error("❌ Error fetching approved PGs:", error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== HEALTH CHECK ====================

app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        message: "PG Finder API running",
        time: new Date().toISOString()
    });
});

// ==================== START SERVER ====================

const server = app.listen(PORT, () => {
    console.log("\n");
    console.log("======================================");
    console.log("🚀 PG Finder Backend Running");
    console.log(`📍 http://localhost:${PORT}`);
    console.log("======================================");
    console.log("\n");
});

server.on("error", err => {
    if (err.code === "EADDRINUSE") {
        console.error("❌ Port 3000 already in use");
        process.exit(1);
    }
});


