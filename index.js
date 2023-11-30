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
  origin:['http://localhost:5173','http://localhost:5174','https://assignment-12-847d7.web.app','https://assignment-12-847d7.firebaseapp.com'],
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
    const favouriteCollection = client.db('concordDB').collection('favorites')
    const premiumRequestCollection = client.db('concordDB').collection('premiumRequest')

    app.get('/', (req, res) => {
        res.send('Hello World!')
    })

    app.post('/jwt',async(req,res)=>{
        const body = req.body;
        const token = jwt.sign(body,process.env.SECRET_KEY,{expiresIn:'1h'})
        res.cookie(
            "token",
            token,
            {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production" ? true: false,
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
            }
            )           
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
        const {type,location,maxAge:maxAgeStr,minAge:minAgeStr,isFavourite} = req.query || {}
        const maxAge = parseInt(maxAgeStr)
        const minAge = parseInt(minAgeStr)
        
        let queryAge;
        if (maxAge || minAge) {
            queryAge = {Age: {$gt:minAge,$lt:maxAge}}
        }
        let query;
        if (location?.length) {
            query = {PermanentDivision:location}
        }
        if (type?.length) {
            query = {BiodataType:type}
        }
        if (type?.length && location?.length) {
            query = {BiodataType:type,PermanentDivision:location}
        }


        let result = await biodatasCollection.find({...queryAge,...query}).toArray()

        

        res.send(result)
    })

    app.get('/biodatas-premium',async(req,res)=>{
        const users = await userCollection.find({role:'premium'}).toArray()
        const premiumUsersEmail = []
        users.map(user=>{
            premiumUsersEmail.push(user.email)
        })
        console.log(premiumUsersEmail);
        const premiumBiodata = await biodatasCollection.find({ContactEmail:premiumUsersEmail[0]}).sort({Age:1}).toArray()
        premiumBiodata.push(await biodatasCollection.findOne({ContactEmail: premiumUsersEmail[1]}))
        premiumBiodata.push(await biodatasCollection.findOne({ContactEmail: premiumUsersEmail[2]}))
        premiumBiodata.push(await biodatasCollection.findOne({ContactEmail: premiumUsersEmail[3]}))
        premiumBiodata.push(await biodatasCollection.findOne({ContactEmail: premiumUsersEmail[4]}))
        premiumBiodata.push(await biodatasCollection.findOne({ContactEmail: premiumUsersEmail[5]}))
        res.send(premiumBiodata)
    })

    app.get('/biodatas-count',async(req,res)=>{
        const totalBiodata = await biodatasCollection.estimatedDocumentCount()
        const maleBiodata = await biodatasCollection.countDocuments({BiodataType:'Male'})
        const femaleBiodata = await biodatasCollection.countDocuments({BiodataType:'Female'})

        const premiumBiodata = await userCollection.countDocuments({role:'premium'})

        res.send({totalBiodata,maleBiodata,femaleBiodata,premiumBiodata})
    })

    app.put('/biodatas',async(req,res)=>{      
        const biodata = req?.body 
        const {ContactEmail} = biodata || {}
        console.log(ContactEmail,{...biodata});
        const filter = {ContactEmail}
        const updatedBiodata = {
            $set:{...biodata}
        }
        const result = await biodatasCollection.updateOne(filter,updatedBiodata)
        res.send(result)
    })

    app.post('/biodatas',async(req,res)=>{
        const biodataIdMax = await biodatasCollection.find().sort({BiodataId:-1}).limit(1).toArray()
        const BiodataId = parseInt(biodataIdMax[0].BiodataId) + 1
        const biodata = req?.body;
        const result = await biodatasCollection.insertOne({...biodata,BiodataId})
        res.send(result)
    })

    app.get('/biodatas/:email',async(req,res)=>{
        const {email} = req.params
        console.log(email);
        const query = {ContactEmail: email}
        const biodata = await biodatasCollection.findOne(query)
        res.send(biodata)
    })

    app.get('/biodata-details/:id',async(req,res)=>{
        const id = parseInt(req.params?.id)
        console.log(id);
        const query = {BiodataId: id}
        const biodata = await biodatasCollection.findOne(query)
        res.send(biodata)
    })
  

    app.post('/favorites-biodata',async(req,res)=>{
        const biodata = req.body;
        console.log(biodata);
        const isExist = await favouriteCollection.findOne({BiodataId:biodata.BiodataId,userEmail:biodata.userEmail});
        if (!isExist) {
            const result = await favouriteCollection.insertOne(biodata)
            return res.send(result)
        }
        return res.send({message:'Exist',status:403})
    })

    app.get('/favorites-biodata',async(req,res)=>{
        const {email} = req.query
        console.log(email);
        const query = {userEmail: email}
        const biodata = await favouriteCollection.find(query).toArray();
        res.send(biodata)
    })

    app.delete('/favorites-biodata/:id',async(req,res)=>{
        const {id} = req.params
        console.log('ID',id);
        const query = {_id: new ObjectId(id)}
        const biodata = await favouriteCollection.deleteOne(query);
        res.send(biodata)
    })

    // admin route
    app.post('/biodatas/admin/premium-request',async(req,res)=>{
        const biodata = req?.body;
        const isExist = await premiumRequestCollection.findOne({Email:biodata?.Email})
        if (!isExist) {
            const result = await premiumRequestCollection.insertOne(biodata)
            return res.send(result)        
        }
        return res.send({message:'exist',status:403})       
    })

    app.get('/biodatas/admin/premium-request',async(req,res)=>{
        const biodata = await premiumRequestCollection.find().toArray();
        res.send(biodata)
    })

    app.delete('/biodatas/admin/premium-request/:email',async(req,res)=>{
        const {email} = req.params
        console.log('email',email);
        const query = {Email: email}
        const biodata = await premiumRequestCollection.deleteOne(query);
        res.send(biodata)
    })

    // users route
    app.get('/users',verify,verifyAdmin,async(req,res)=>{
        const {userName} = req.query || {}
        console.log(userName);
        let query;
        if (userName?.length) {
            query = {name: userName}
        }
        const result = await userCollection.find(query).toArray()
        res.send(result)
    })

    app.get('/users/premium/:email',async(req,res)=>{
        const email = req.params?.email
        const query = {email:email}
        const user = await userCollection.findOne(query)
        let premium = false;
        if (user) {
            premium = user?.role === 'premium'
        }
        res.send({premium})
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

    app.patch('/users/admin/:email',verify,verifyAdmin,async(req,res)=>{
        const email = req.params?.email;
        const {role} = req.body
        console.log(email,role);
        const filter = {email}
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