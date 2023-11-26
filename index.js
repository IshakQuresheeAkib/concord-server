const express = require('express')
const cors = require('cors')
require('dotenv').config(); 
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')

const port = process.env.PORT || 5000;
const app = express()
 
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vuba6ki.mongodb.net/?retryWrites=true&w=majority`;

app.use(cors({
  origin:['http://localhost:5173','http://localhost:5174'],
  credentials:true
}))
app.use(express.json())
app.use(cookieParser())

const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });

// middlewares
const verify = async (req,res,next)=>{
  const token = req?.cookies?.token
  if (!token) {
      return res.status(401).send({error:'Forbidden access',status:401})
  }
  jwt.verify(token,process.env.SECRET_KEY,(err,decode)=>{
      if (err) {
          console.log(err);
          return res.status(403).send({error:'wrong access',status:401})
      }
      req.decode = decode;
      next();
  })
  
}



async function run() {
try {

    const userCollection = client.db('concordDB').collection('users')
    const biodatasCollection = client.db('concordDB').collection('biodatas')

    app.get('/', (req, res) => {
        res.send('Hello World!')
    })

    app.post('/jwt',async(req,res)=>{
        const body = req.body;
        const token = jwt.sign(body,process.env.SECRET_KEY,{expiresIn:'1h'})
        res.cookie('token', token, {
            httpOnly: true,       
            secure: false, 
            // sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',           
        })               
        .send({message:'SUCCESS',token})
    })

    app.post('/logout',async(req,res)=>{
        const user = req.body;
  
            res.clearCookie(
            "token",
            {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production" ? true: false,
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
            }
            )
            .send({message:'Logged out'})
    })

    const verifyAdmin = async (req,res,next)=>{
        const email = req.decode.email;
        const query = {email: email}
        const user = await userCollection.findOne(query)
        const isAdmin = user?.role === 'admin'
        if (!isAdmin) {
            return res.status(401).send({message:'Forbidden Access'})
        }
        next();
    }  

    app.get('/biodatas',async(req,res)=>{
        const result = await biodatasCollection.find().toArray()
        res.send(result)
    })

  
    app.get('/users',verify,verifyAdmin,async(req,res)=>{
        const result = await userCollection.find().toArray()
        res.send(result)
    })

    app.get('/users/admin/:email',verify,async(req,res)=>{
        const email = req.params?.email
        if (email !== req.decode.email) {
            return res.status(401).send({error:'Forbidden access',status:401})
        }
        const query = {email:email}
        const user = await userCollection.findOne(query)
        let admin = false;
        if (user) {
            admin = user?.role === 'admin'
        }
        res.send({admin})
    })

    app.post('/users',async(req,res)=>{
        const user = req.body;
        const query = {email:user?.email}
        const existingUser = await userCollection.findOne(query)
        if (existingUser) {
            return res.send({message:'User already exist',insertedId:null})
        }
        const result = await userCollection.insertOne(user)
        res.send(result)
    })

    app.patch('/users/admin/:id',verify,verifyAdmin,async(req,res)=>{
        const id = req.params?.id;
        const {role} = req.body
        console.log(id,role);
        const filter = {_id:new ObjectId(id)}
        const updatedUser = {
            $set:{role}
        }
        const result = await userCollection.updateOne(filter,updatedUser)
        res.send(result)
    })

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
} finally {}
}
run().catch(console.dir);



app.listen(port, () => {
console.log(`Example app listening on port ${port}`)
})