const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require("cors")
require("dotenv").config()
const port = process.env.PORT 

const app = express();
app.use(cors());
app.use(express.json())

const admin = require("firebase-admin");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


const verifyFBToken = async (req,res, next)=>{
  console.log("AUTH HEADER:", req.headers.authorization);
  const token = req.headers.authorization;

  if(!token){
    return res.status(401).send({message: "unauthorize access"})
  }
  try{
    const idToken = token.split(" ")[1]
    const decoded = await admin.auth().verifyIdToken(idToken)
    console.log("decorded info", decoded)
    req.decoded_email = decoded.email;
    next();
  }
  catch(error){
return res.status(401).send({message: "unauthorize access"})
  }
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.iovcwwa.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const database = client.db("roktosheba11")
    const userCollections = database.collection("user")
    const requestCollection = database.collection("request")

    app.post("/users", async(req,res)=>{
        const userInfo = req.body;
        userInfo.role = "Donor";
        userInfo.status = "Active";
        userInfo.createdAt = new Date();

        const result = await userCollections.insertOne(userInfo);
        res.send(result)

    })

    app.get("/users", verifyFBToken, async (req,res)=>{
      const result = await userCollections.find().toArray();
      res.status(200).send(result)
    })


    app.get("/users/role/:email",async(req,res)=>{
      const {email} = req.params
      console.log(email);


      const query = {email:email}
        const result = await userCollections.findOne(query)
        console.log(result);
        res.send(result)
      
    })

     app.get("/users/:email", verifyFBToken, async(req,res)=>{
       const email = req.params.email;
     
       if (email !== req.decoded_email) {
         return res.status(403).send({ message: "Forbidden" });
       }

       const query = { email };
       const result = await userCollections.findOne(query);
       res.send(result);
     });


    app.patch("/user/status", verifyFBToken, async (req, res)=>{
      const {email, status} = req.query;
      const query =  {email:email};

      const updateStatus = {
        $set: {
          status: status
        }
      }

      const result = await userCollections.updateOne(query, updateStatus)
      res.send(result)
    })

    app.post("/request", verifyFBToken, async(req,res)=>{
      const data = req.body;
      data.createdAt = new Date();
      const result = await requestCollection.insertOne(data)
      res.send(result)
    })

     app.get("/my-requests", verifyFBToken, async (req, res) => {
      const email = req.decoded_email;

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 5;
      const skip = (page - 1) * limit;
      const query = { requesterEmail: email };

      const total = await requestCollection.countDocuments(query);

      const result = await requestCollection
        .find(query)
        .skip(skip)
        .limit(limit)
        .toArray();

       res.send({
         total,
              page,
         totalPages: Math.ceil(total / limit),
         data: result
       });
     });

    app.get("/admin/stats", verifyFBToken, async (req, res) => {

      const totalUsers = await userCollections.countDocuments();

      const totalRequests = await requestCollection.countDocuments();

      const totalFunding = 0;

      res.send({
        totalUsers,
        totalFunding,
        totalRequests
      });
    });
   app.get("/admin/recent-activities", verifyFBToken, async (req, res) => {

     const result = await requestCollection
       .find()
       .sort({ createdAt: -1 })
       .limit(5)
       .toArray();

     const activities = result.map(item => ({
       _id: item._id,
       userName: item.requesterName || "Unknown",
       action: "Submitted a blood request",
       date: new Date(item.createdAt).toLocaleString(),
       status: item.status || "pending"
     }));

     res.send(activities);
     });
    app.get("/requests/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const result = await requestCollection.findOne({
        _id: new ObjectId(id)
      });
      res.send(result);
    });
   app.delete("/requests/:id", verifyFBToken, async (req, res) => {
     const id = req.params.id;
     const result = await requestCollection.deleteOne({
       _id: new ObjectId(id)
     });
     res.send(result);
   });

   app.get("/all-requests", verifyFBToken, async (req, res) => {
     const page = parseInt(req.query.page) || 1;
     const limit = parseInt(req.query.limit) || 10;
     const skip = (page - 1) * limit;

     const { search, status } = req.query;

     let query = {};
   
     if (search) {
       query.$or = [
         { requesterName: { $regex: search, $options: "i" } },
         { district: { $regex: search, $options: "i" } },
       ];
     }

  if (status) {
    query.status = status;
  }

  const total = await requestCollection.countDocuments(query);

  const result = await requestCollection
    .find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  res.send({
    total,
    page,
    totalPages: Math.ceil(total / limit),
    data: result,
  });
});
// Backend: Update a request
app.patch("/requests/:id", verifyFBToken, async (req, res) => {
  try {
    const id = req.params.id; // URL থেকে id
    const updateData = req.body; // frontend থেকে পাঠানো data

    console.log("PATCH id:", id);
    console.log("PATCH body:", updateData);

    // MongoDB update
    const result = await requestCollection.updateOne(
      { _id: new ObjectId(id) }, // ensure ObjectId
      { $set: { ...updateData, updatedAt: new Date() } }
    );

    // Send response
    res.send({
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).send({ message: "Update failed" });
  }
});


app.patch("/users/:email", verifyFBToken, async (req, res) => {
  const email = req.params.email;
  if (email !== req.decoded_email) {
    return res.status(403).send({ message: "Forbidden access" });
  }

  const updatedData = req.body;

  const updateDoc = {
    $set: {
      name: updatedData.name,
      phone: updatedData.phone,
      district: updatedData.district,
      upazila: updatedData.upazila,
      blood: updatedData.blood,
      updatedAt: new Date()
    }
  };

  const result = await userCollections.updateOne(
    { email },
    updateDoc
  );

  res.send(result);
});

app.get("/search-request", async (req, res) => {
  const { blood, district, upazila } = req.query;

  const orConditions = [];

  if (blood) {
    orConditions.push({ bloodGroup: blood });
  }

  if (district) {
    orConditions.push({
      district: { $regex: district.trim(), $options: "i" }
    });
  }

  if (upazila) {
    orConditions.push({
      upazila: { $regex: upazila.trim(), $options: "i" }
    });
  }

  const query =
    orConditions.length > 0 ? { $or: orConditions } : {};

  console.log("FINAL QUERY:", query);

  const result = await requestCollection.find(query).toArray();
  res.send(result);
});







    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('hello Go Tickets')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
