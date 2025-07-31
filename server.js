


const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');


const app = express();

const PORT = process.env.PORT || 5000;
const { createClient } = require('@supabase/supabase-js');
app.use(cors({
origin: ['http://localhost:5173', 'https://speechtotextconversion.netlify.app'],  methods: ['GET', 'POST'],
  credentials: true, // Optional: if you're using cookies or auth
}));
const supabaseUrl = 'https://mutqnggyktozmzgprsjv.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11dHFuZ2d5a3Rvem16Z3Byc2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4MTgxNTYsImV4cCI6MjA2ODM5NDE1Nn0.lyt-DS8ygG5W-J9yAg8RUvx9fgAaOJTgCtgreN_0uZ4';

const supabase = createClient(supabaseUrl, supabaseAnonKey);
require('dotenv').config();
const apiKey = process.env.OPENAI_API_KEY;

// Create storage engine for multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const audioFileFilter = (req, file, cb) => {
  const filetypes = /mp3|mpeg|wav|webm|ogg|x-wav|x-m4a|aac|m4a|mp4|octet-stream/;
  const mimetype = filetypes.test(file.mimetype);
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only audio files are allowed!'));
  }
};

const upload = multer({
  storage,
  fileFilter: audioFileFilter,
});
// Make sure "uploads/" folder exists
const fs = require('fs');
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// File upload route
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const uploadedFile = req.file;
    console.log('Uploaded file:', uploadedFile);

    const filePath = path.join(__dirname, uploadedFile.path); // Full path to file

    // Use Whisper API to transcribe the audio
    const FormData = require('form-data');
    const axios = require('axios');
    const fs = require('fs');

    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));
    formData.append('model', 'whisper-1');

    const whisperResponse = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${apiKey}`, 
        },
      }
    );

    const transcription = whisperResponse.data.text;
    const fileUrl = `uploads/${uploadedFile.filename}`;

    // Save in Supabase
    const { data, error } = await supabase
      .from('transcriptions')
      .insert([
        {
          file_url: fileUrl,
          transcription: transcription,
        },
      ]);

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({
        error: 'Supabase insert failed',
        details: error.message || error,
      });
    }

    res.status(200).json({
      message: 'File uploaded and transcribed!',
      filename: uploadedFile,
      transcription: transcription,
      supabaseRow: data,
    });

  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

app.get('/recording', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('transcriptions')
      .select('*')
      .order('created_at', { ascending: false }); // Optional: order latest first

    if (error) {
      console.error('Error fetching transcriptions:', error.message);
      return res.status(500).json({ error: 'Failed to fetch transcriptions' });
    }

    res.status(200).json({ transcriptions: data });
  } catch (err) {
    console.error('Unexpected server error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/transcription/:filename', async (req, res) => {
  const { filename } = req.params;

  const { data, error } = await supabase
    .from('transcriptions')
    .select('transcription')
    .eq('file_url', `uploads/${filename}`)
    .maybeSingle(); // ✅ Use maybeSingle to avoid error when 0 rows

  if (error) {
    console.error('Supabase error:', error);
    return res.status(500).json({ error: 'Supabase query failed', details: error.message });
  }

  if (!data) {
    return res.status(404).json({ error: 'Transcription not found' });
  }

  res.status(200).json({ transcription: data.transcription });
});


// Start server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
