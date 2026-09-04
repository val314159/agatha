# Register
curl -i -X POST http://localhost:5002/register \
     -H 'Content-Type: application/json' \
     -d '{"email":"x@x.com","digest":"9a900403ac313ba27a1bc81f0932652b8020dac92c234d98fa0b06bf0040ecfd"}'
