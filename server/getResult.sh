for (( i=1;i<=$1;i++ ))
do
curl 127.0.0.1:300$i/status
echo
done