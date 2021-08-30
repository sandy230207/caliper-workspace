for (( i=1;i<=$1;i++ ))
do
port=$((3000+$i))
curl 127.0.0.1:${port}/status
echo
done