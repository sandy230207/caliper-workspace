for (( i=1;i<=$1;i++ ))
do
port=$((3000+$i))
lsof -i :${port}
lsof -i :${port} | awk '{system("kill -9 " $2)}'
lsof -i :${port}
done