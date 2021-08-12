for (( i=1;i<=$1;i++ ))
do
lsof -i :300$i
lsof -i :300$i | awk '{system("kill -9 " $2)}'
lsof -i :300$i
done