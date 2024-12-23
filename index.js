const express = require('express');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const methodOverride = require('method-override');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const flash = require('connect-flash');
const expressLayouts = require('express-ejs-layouts');

const app = express();
const port = 3000;
const uri = "mongodb://localhost:27017";
const client = new MongoClient(uri);
const dbName = "hospital_drug_management";
let db;

async function connectToDatabase() {
    try {
        await client.connect();
        console.log("Connected to MongoDB");
        db = client.db(dbName);
        startServer();
    } catch (error) {
        console.error("Error connecting to database:", error);
    }
}

connectToDatabase();

const startServer = () => {
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));
    app.use(express.static(path.join(__dirname, 'public')));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(methodOverride('_method'));

    // Configure express-session
    app.use(session({
        secret: 'your_secret_key', // Replace with a strong, random secret
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false } // Set to true if using HTTPS
    }));

    app.use(flash());

    // Use express-ejs-layouts middleware
    app.use(expressLayouts);
    app.set('layout', 'layout'); // Set the default layout file

    // Middleware to make flash messages available in templates
    app.use((req, res, next) => {
        res.locals.success_msg = req.flash('success_msg');
        res.locals.error_msg = req.flash('error_msg');
        next();
    });

    // Middleware to check if the user is authenticated
    function ensureAuthenticated(req, res, next) {
        if (req.session.user) {
            // User is logged in, proceed to the next middleware/route handler
            return next();
        } else {
            // User is not logged in, redirect to login page
            req.flash('error_msg', 'Please log in to view that resource.');
            res.redirect('/login');
        }
    }

    // Middleware to check if the user is an admin
    function isAdmin(req, res, next) {
        if (req.session.user && req.session.user.role === 'admin') {
            // User is an admin, proceed to the next middleware/route handler
            return next();
        } else {
            // User is not an admin, send an error message or redirect to home page
            req.flash('error_msg', 'You are not authorized to perform this action.');
            res.redirect('/');
        }
    }

    // Basic route for the homepage
    app.get('/', async (req, res) => {
        try {
            const drugsCollection = db.collection('drugs');
            const page = parseInt(req.query.page) || 1;
            const perPage = 3;
            const skip = (page - 1) * perPage;

            const drugs = await drugsCollection.find({}).skip(skip).limit(perPage).toArray();
            const totalDrugs = await drugsCollection.countDocuments();

            res.render('index', {
                title: 'Hospital Drug Management',
                drugs: drugs,
                page: page,
                totalPages: Math.ceil(totalDrugs / perPage),
                user: req.session.user
            });
        } catch (error) {
            console.error("Error fetching drugs:", error);
            res.status(500).send("Error fetching drugs");
        }
    });

    // Display the form for adding a new drug
app.get('/add-drug', ensureAuthenticated, async (req, res) => {
    try {
        const drugsCollection = db.collection('drugs');
        const page = parseInt(req.query.page) || 1;
        const perPage = 6; // Adjust as needed
        const skip = (page - 1) * perPage;

        const drugs = await drugsCollection.find({}).skip(skip).limit(perPage).toArray();
        const totalDrugs = await drugsCollection.countDocuments();

        res.render('addDrug', {
            title: 'Add Drug',
            drugs: drugs,
            page: page,
            totalPages: Math.ceil(totalDrugs / perPage),
            user: req.session.user
        });
    } catch (error) {
        console.error("Error fetching drugs:", error);
        res.status(500).send("Error fetching drugs");
    }
});
    // Handle the form submission for adding a new drug
    app.post('/add-drug', ensureAuthenticated, async (req, res) => {
        try {
            const drugsCollection = db.collection('drugs');
            const newDrug = {
                name: req.body.name,
                dosage: req.body.dosage,
                manufacturer: req.body.manufacturer,
                description: req.body.description,
                category: req.body.category,
                stock: parseInt(req.body.stock),
                price: parseFloat(req.body.price),
                expiryDate: new Date(req.body.expiryDate)
            };
            await drugsCollection.insertOne(newDrug);

            req.flash('success_msg', 'Drug added successfully!');
            res.redirect('/');
        } catch (error) {
            console.error("Error adding drug:", error);
            req.flash('error_msg', 'Error adding drug');
            res.redirect('/add-drug');
        }
    });

    // Display the details of a specific drug
    app.get('/drugs/:id', ensureAuthenticated, async (req, res) => {
        try {
            const drugsCollection = db.collection('drugs');
            const id = req.params.id;

            if (!/^[0-9a-fA-F]{24}$/.test(id)) {
                res.status(400).send("Invalid drug ID format");
                return;
            }

            const drugId = new ObjectId(id);
            const drug = await drugsCollection.findOne({ _id: drugId });

            if (drug) {
                res.render('drugDetails', { drug: drug, title: 'Drug Details' });
            } else {
                res.status(404).send("Drug not found");
            }
        } catch (error) {
            console.error("Error fetching drug details:", error);
            res.status(500).send("Error fetching drug details");
        }
    });

    // Display the form for editing a drug
    app.get('/drugs/edit/:id', ensureAuthenticated, async (req, res) => {
        try {
            const drugsCollection = db.collection('drugs');
            const id = req.params.id;

            if (!/^[0-9a-fA-F]{24}$/.test(id)) {
                res.status(400).send("Invalid drug ID format");
                return;
            }

            const drugId = new ObjectId(id);
            const drug = await drugsCollection.findOne({ _id: drugId });

            if (drug) {
                res.render('editDrug', { drug: drug, title: 'Edit Drug' });
            } else {
                res.status(404).send("Drug not found");
            }
        } catch (error) {
            console.error("Error fetching drug for editing:", error);
            res.status(500).send("Error fetching drug for editing");
        }
    });

    // Handle the form submission for updating a drug
    app.post('/drugs/update/:id', ensureAuthenticated, async (req, res) => {
        try {
            const drugsCollection = db.collection('drugs');
            const id = req.params.id;
            if (!/^[0-9a-fA-F]{24}$/.test(id)) {
                res.status(400).send("Invalid drug ID format");
                return;
            }
            const drugId = new ObjectId(id);
            const updatedDrug = {
                name: req.body.name,
                dosage: req.body.dosage,
                manufacturer: req.body.manufacturer,
                description: req.body.description,
                category: req.body.category,
                stock: parseInt(req.body.stock),
                price: parseFloat(req.body.price),
                expiryDate: new Date(req.body.expiryDate)
            };
            const result = await drugsCollection.updateOne(
                { _id: drugId },
                { $set: updatedDrug }
            );
            if (result.modifiedCount === 1) {
                req.flash('success_msg', 'Drug updated successfully!');
                res.redirect('/drugs/' + drugId);
            } else {
                req.flash('error_msg', 'Drug not found or not updated');
                res.redirect('/drugs/edit/' + drugId);
            }
        } catch (error) {
            console.error("Error updating drug:", error);
            req.flash('error_msg', 'Error updating drug');
            res.redirect('/drugs/edit/' + drugId);
        }
    });

    // DELETE route for deleting a drug
    app.delete('/drugs/:id', ensureAuthenticated, async (req, res) => {
        try {
            const drugsCollection = db.collection('drugs');
            const id = req.params.id;

            if (!/^[0-9a-fA-F]{24}$/.test(id)) {
                res.status(400).send("Invalid drug ID format");
                return;
            }

            const drugId = new ObjectId(id);
            const result = await drugsCollection.deleteOne({ _id: drugId });

            if (result.deletedCount === 1) {
                req.flash('success_msg', 'Drug deleted successfully!');
                res.redirect('/');
            } else {
                req.flash('error_msg', 'Drug not found or not deleted');
                res.redirect('/');
            }
        } catch (error) {
            console.error("Error deleting drug:", error);
            req.flash('error_msg', 'Error deleting drug');
            res.redirect('/');
        }
    });

    // GET route for the registration form
    app.get('/register', (req, res) => {
        res.render('register', { title: 'Register' });
    });

    // POST route for registration form submission
    app.post('/register', async (req, res) => {
        try {
            const usersCollection = db.collection('users');
            const { username, password } = req.body;

            // Generate a salt with 10 rounds
            const salt = await bcrypt.genSalt(10);

            // Hash the password with the salt
            const hashedPassword = await bcrypt.hash(password, salt);

            // Store the user with the hashed password and default role
            await usersCollection.insertOne({
                username: username,
                password: hashedPassword,
                role: 'user' // Default role
            });

            req.flash('success_msg', 'User registered successfully. Please log in.');
            res.redirect('/login');
        } catch (error) {
            console.error("Error during registration:", error);
            req.flash('error_msg', 'Error during registration.');
            res.redirect('/register');
        }
    });

    // GET route for the login form
    app.get('/login', (req, res) => {
        res.render('login', { title: 'Login' });
    });

    // POST route for login
    app.post('/login', async (req, res) => {
        try {
            const usersCollection = db.collection('users');
            const { username, password } = req.body;
            console.log("Attempting to log in with:", username, password);
            const user = await usersCollection.findOne({ username: username });
            console.log("Found user:", user);
            if (user) {
                const passwordMatch = await bcrypt.compare(password, user.password);
                console.log("Password match:", passwordMatch);
                if (passwordMatch) {
                    console.log("Password is correct");
                    // Store user data in the session
                    req.session.user = {
                        id: user._id,
                        username: user.username,
                        role: user.role // Store the user's role in the session
                    };
                    console.log("Login successful!");
                    req.flash('success_msg', 'You are now logged in.');
                    res.redirect('/');
                } else {
                    console.log("Incorrect password");
                    req.flash('error_msg', 'Invalid username or password');
                    res.redirect('/login');
                }
            } else {
                console.log("User not found");
                req.flash('error_msg', 'Invalid username or password');
                res.redirect('/login');
            }
        } catch (error) {
            console.error("Error during login:", error);
            res.status(500).send("Error during login");
        }
    });

    // GET route for logout
    app.get('/logout', (req, res) => {
        req.session.destroy(err => {
            if (err) {
                console.error("Error destroying session:", err);
                req.flash('error_msg', 'Error logging out.');
                res.redirect('/'); // Redirect to home even on error
            } else {
                req.flash('success_msg', 'You are logged out.');
                res.redirect('/login'); // Redirect to the login page
            }
        });
    });

    // Search route
    app.get('/search', async (req, res) => {
        try {
            const drugsCollection = db.collection('drugs');
            const query = req.query.query;

            let drugs;
            if (query) {
                drugs = await drugsCollection.find({ name: { $regex: query, $options: 'i' } }).toArray();
            } else {
                drugs = await drugsCollection.find({}).toArray();
            }

            res.render('search', { drugs: drugs, query: query, title: 'Search Results' });
        } catch (error) {
            console.error("Error searching for drugs:", error);
            res.status(500).send("Error searching for drugs");
        }
    });

    // API route to get all drugs (example)
    app.get('/api/drugs', async (req, res) => {
        try {
            const drugsCollection = db.collection('drugs');
            const drugs = await drugsCollection.find({}).toArray();
            res.json(drugs); // Send the drugs as JSON data
        } catch (error) {
            console.error("Error fetching drugs:", error);
            res.status(500).json({ error: "Error fetching drugs" });
        }
    });
    // API route to get a specific drug by ID
    app.get('/api/drugs/:id', ensureAuthenticated, async (req, res) => {
        try {
            const drugsCollection = db.collection('drugs');
            const id = req.params.id;
    
            if (!/^[0-9a-fA-F]{24}$/.test(id)) {
                return res.status(400).json({ error: "Invalid drug ID format" });
            }
    
            const drugId = new ObjectId(id);
            const drug = await drugsCollection.findOne({ _id: drugId });
    
            if (drug) {
                res.json(drug); // Send the drug as JSON data
            } else {
                res.status(404).json({ error: "Drug not found" });
            }
        } catch (error) {
            console.error("Error fetching drug:", error);
            res.status(500).json({ error: "Error fetching drug" });
        }
    });
    
    // API route to add a new drug (POST)
    app.post('/api/drugs', ensureAuthenticated, isAdmin, async (req, res) => {
        try {
            const drugsCollection = db.collection('drugs');
            const newDrug = {
                name: req.body.name,
                dosage: req.body.dosage,
                manufacturer: req.body.manufacturer,
                description: req.body.description,
                category: req.body.category,
                stock: parseInt(req.body.stock),
                price: parseFloat(req.body.price),
                expiryDate: new Date(req.body.expiryDate)
            };
            const result = await drugsCollection.insertOne(newDrug);
    
            res.status(201).json(newDrug); // Return the newly created drug
        } catch (error) {
            console.error("Error adding drug:", error);
            res.status(500).json({ error: "Error adding drug" });
        }
    });
    
    // API route to update a drug (PUT)
    app.put('/api/drugs/:id', ensureAuthenticated, isAdmin, async (req, res) => {
        try {
            const drugsCollection = db.collection('drugs');
            const id = req.params.id;
    
            if (!/^[0-9a-fA-F]{24}$/.test(id)) {
                return res.status(400).json({ error: "Invalid drug ID format" });
            }
    
            const drugId = new ObjectId(id);
            const updatedDrug = {
                name: req.body.name,
                dosage: req.body.dosage,
                manufacturer: req.body.manufacturer,
                description: req.body.description,
                category: req.body.category,
                stock: parseInt(req.body.stock),
                price: parseFloat(req.body.price),
                expiryDate: new Date(req.body.expiryDate)
            };
    
            const result = await drugsCollection.updateOne(
                { _id: drugId },
                { $set: updatedDrug }
            );
    
            if (result.modifiedCount === 1) {
                res.status(200).json(updatedDrug); // Return the updated drug
            } else {
                res.status(404).json({ error: "Drug not found or not updated" });
            }
        } catch (error) {
            console.error("Error updating drug:", error);
            res.status(500).json({ error: "Error updating drug" });
        }
    });
    
    // API route to delete a drug (DELETE)
    app.delete('/api/drugs/:id', ensureAuthenticated, isAdmin, async (req, res) => {
        try {
            const drugsCollection = db.collection('drugs');
            const id = req.params.id;
    
            if (!/^[0-9a-fA-F]{24}$/.test(id)) {
                return res.status(400).json({ error: "Invalid drug ID format" });
            }
    
            const drugId = new ObjectId(id);
            const result = await drugsCollection.deleteOne({ _id: drugId });
    
            if (result.deletedCount === 1) {
                res.status(204).send(); // No content (successful deletion)
            } else {
                res.status(404).json({ error: "Drug not found" });
            }
        } catch (error) {
            console.error("Error deleting drug:", error);
            res.status(500).json({ error: "Error deleting drug" });
        }
    });

    // Start the server
    app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`);
    });
};