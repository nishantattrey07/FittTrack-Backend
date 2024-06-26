const { Router } = require("express");
const adminMiddleware = require("../middleware/admin");
const { Admin, User, Food } = require("../db");
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const userMiddleware = require("../middleware/user");
require('dotenv').config();
const router = Router();

const saltRounds = 10;
const userSchema = z.object({
    name: z.string().min(1),
    username: z.string().min(3),
    password: z.string().min(8),
    email: z.string().email()
}).strict();

const foodSchema = z.object({
    category: z.enum(['Fruit', 'Vegetables', 'Grains', 'Proteins', 'Dairy', 'Beverages', 'Prepared Foods','others']),
    name: z.string(),
    protein: z.number().positive(),
    fat: z.number().positive(),
    carbs: z.number(),
    calories:z.number(),
    quantity: z.string()
});

function validateUser(name, username, email, password) { 
    let data = userSchema.safeParse({ name, username, email, password });
    return data.success ? true : false;

}

function validateFood(category, name, protein, fat, carbs, calories, quantity) {
    let data = foodSchema.safeParse({ category, name, protein, fat, carbs, calories, quantity });
    return data.success ? true : data.error;
}
router.post('/signup', async (req, res) => {
    const { name, username, email, password } = req.body;
    if (validateUser(name, username, email, password)) { 
        try {
            const existingUser = await User.findOne({ username: username });
            if (!existingUser) { 
                try {
                    const hashedPassword = await bcrypt.hash(password, saltRounds);
                    const newUser = new User({ name, username, email, password: hashedPassword });
                    await newUser.save();
                    const token = jwt.sign({ username: username }, process.env.token_secret, {expiresIn:'7d'});
                    console.log("User is being saved")
                    res.status(201).json({
                        token: token,
                        username: username,
                        id:newUser._id
                    });
                } catch (err) { 
                    console.log(err);
                    return res.status(404).send(`Our server has some issue`);
                }
            } else return res.status(409).send("Username already exists.");
        }
        catch (err) {
            console.log(err);
            return res.status(400).send("Invalid input");
        }
    } else return res.status(400).send("Invalid input");

});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const existingUser = await User.findOne({ username: username });
    const validPassword = await bcrypt.compare(password, existingUser.password);
    if (existingUser && validPassword) {
        const token = jwt.sign({ username }, process.env.token_secret, { expiresIn: '7d' });
        res.status(200).header('auth-token', token).json({
            token: token
        });
    }
    else {
        return res.status(401).send('Wrong credentials');
    }
});

router.get('/profile', userMiddleware, async (req, res) => { 
    const username = req.user.username;
    let userProfile = await User.findOne({ username: username });
    res.status(200).json({
        name: userProfile.name,
        username: userProfile.username,
        email:userProfile.email
    });
});

router.post('/addFood', userMiddleware, async function (req, res) {
    const username = req.user.username;
    const user = await User.findOne({ username: username });
    const { category, name, protein, fat, carbs, calories, quantity } = req.body;
    const validation = validateFood(category, name, protein, fat, carbs, calories, quantity);
    if (validation===true) {
        try {
            if (await Food.exists({ name: name })) return res.status(409).send(`${name} already exists.`);
            else {
                let newFoodItem = new Food({ category, name, protein, fat, carbs, calories, quantity, user: user._id, global: false });
                await newFoodItem.save();
                res.json({
                    message: `${name} added successfully`,
                    id: newFoodItem._id
                });
            }
        }
        catch (err) {
            res.status(500).send(`Server error: ${err}`);
        }
    }
    else {
        res.status(422).json({
            msg: validation
        });
    }
});
    
router.get('/foods',userMiddleware, async (req, res) => {
    const username = req.user.username;
    const userId = await User.findOne({ username: username });
    const foodItems = await Food.find({
        $or: [{ user: userId }, { global: true }]
    });
    res.status(200).json(foodItems);
});

router.post('/addNutrition', userMiddleware, async (req, res) => {
    const username = req.user.username;
    const { date, category, calories, proteins, carbs, fats } = req.body;
    const user = await User.findOne({ username: username });
    if (user) {
        
        const nutritionEntry = user.dailyNutrition.find(entry => entry.date.toISOString().slice(0, 10) === date);

        if (nutritionEntry) {
            
            nutritionEntry.totalCalories += calories;
            nutritionEntry.totalProteins += proteins;
            nutritionEntry.totalCarbs += carbs;
            nutritionEntry.totalFats += fats;

            
            const categoryEntry = nutritionEntry.categories.find(entry => entry.name === category);

            if (categoryEntry) {
                
                categoryEntry.calories += calories;
                categoryEntry.proteins += proteins;
                categoryEntry.carbs += carbs;
                categoryEntry.fats += fats;
            } else {
                
                nutritionEntry.categories.push({ name: category, calories, proteins, carbs, fats });
            }
        } else {
            
            user.dailyNutrition.push({
                date,
                totalCalories: calories,
                totalProteins: proteins,
                totalCarbs: carbs,
                totalFats: fats,
                categories: [{ name: category, calories, proteins, carbs, fats }]
            });
        }

        await user.save();
        res.status(200).send('Nutrition data added');
    } else {
        res.status(404).send('User not found');
    }
});

router.get('/getNutrition', userMiddleware, async (req, res) => {
    const username = req.user.username;
    const user = await User.findOne({ username: username });
    if (user) {
        res.status(200).json(user.dailyNutrition);
    } else {
        res.status(404).send('User not found');
    }
});


router.put('/updatePassword', userMiddleware, async (req, res) => {
    const username = req.user.username;
    const { newPassword } = req.body;
    const user = await User.findOne({ username: username });
    if (user) {
        // Hash the new password before storing it
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        user.password = hashedPassword;
        await user.save();
        res.status(200).send('Password updated');
    } else {
        res.status(404).send('User not found');
    }
});

module.exports = router;