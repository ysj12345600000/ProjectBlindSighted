import React, { useState, useEffect, createContext, useContext, SetStateAction, Dispatch, useRef } from 'react';

import { FlatList, Button, View, Text, StyleSheet, Alert, NativeModules  } from 'react-native';
import { useBleManager, BleManagerContextProvider, ConnectedDeciceInfo, RssiInfo } from './components/BleOperation1';
import {triangulationCalculater, DsitanceCalculateParams} from './components/triangulationCalculater1';
import { Device } from 'react-native-ble-plx';


interface DeviceInfoDisp {
  device :Device;
  // 在这里添加更多的设备属性
}

const ContextApp = () => {
  const { 
    isAllowRssiScan,
    isSearchBle,
    connectedDevicesInfo,
    setIsAllowRssiScan,
    setIsSearchBle,
    rssiLists,
    setCurrentCommunicatrMacId,
    } = useBleManager();
  const { calculateDistances, getUsersPosition, angleDifference, getCompassDirection } = triangulationCalculater();
  const [ calculateForDistance, setCalculateForDistance ] = useState(false); //允许估计距离
  const [ userHight, setUserHight ] = useState(1.7); // 用户身高
  const intervalRef = useRef<NodeJS.Timer | null>(null);
 // 用于定时器

  //得到的信息
  const [userPosition, setUserPosition] = useState({x: 0, y: 0}); // 用户坐标
  const [userAngle, setUserAngle] = useState(0); // 用户角度,负数则需向右转,正数则需向左转


  const INTERVAL_TIME = 600; // 获取数据间隔时间
  
  // 计算用户坐标,和目标的偏差角度,距离
  useEffect(() => {
    const fetchAngleAndPosition = () => {
      console.log('connectedDevicesInfo', connectedDevicesInfo);
      if(connectedDevicesInfo.length >= 3)
      {
        setCalculateForDistance(true);
        (async () => {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 500ms
      })();
      }
      if(!calculateForDistance) return;

      if(connectedDevicesInfo.length < 3) {
        Alert.alert('请连接至少三个设备');
        return;
      }

      if(connectedDevicesInfo[0].distanceCalculateParams === undefined) {
        handleIncompleteDeviceInformation();
        return;
      }

      calculateDistancePositionAngle(connectedDevicesInfo, rssiLists);
    }

      fetchAngleAndPosition();


  }, [calculateForDistance, connectedDevicesInfo, rssiLists]);

  /**
 * 处理不完整的设备信息。
 */
  const handleIncompleteDeviceInformation = () => {
    console.log('设备信息数量不足，无法计算距离');
    const macId = connectedDevicesInfo.find(deviceInfo => deviceInfo.index === 1)?.device.id;
    if(!macId) {setIsAllowRssiScan(true);return;} // 如果没有找到macId,则重新扫描
    setCurrentCommunicatrMacId(macId)
  }

   /**
   * 开始RSSI扫描并进行距离计算。
   */
   const startRssiScanAndDistanceCalculation = () => {
     setIsAllowRssiScan(true);
     if(rssiLists.every(rssiInfo => rssiInfo.rssiList.length >= 50)) return;

     let connectedDevicesInfoCopy = [...connectedDevicesInfo];

  }

  const calculateDistancePositionAngle = async ( deviceInfoList : ConnectedDeciceInfo[], rssiLists : RssiInfo[]) => {
    const updateDeviceInfo = await calculateDistances(deviceInfoList, rssiLists);
    const position = await getUsersPosition(updateDeviceInfo, userHight);

    if(!position) return;

    console.log('用户坐标', position);

    const angle = await angleDifference(updateDeviceInfo, {x: position![0], y: position![1]});

    if(!angle) return;

    console.log('用户离目标角度', angle);

    setUserPosition({x: position![0], y: position![1]});
    setUserAngle(angle);

    setCalculateForDistance(false);
  }



  //渲染扫描的设备列表
  const renderDeviceInfoDisp= ( {item}: {item: DeviceInfoDisp}) => {

    let displayName = item.device.name;
    if (!displayName) {
      displayName = 'Unknown Device';
    }

    return (
      <View style={[styles.itemContainer, {alignItems: 'center'}]}>
      <View style={{flexDirection: 'column', alignItems: 'center'}}>

        <Text style={styles.itemText}>设备名称: {displayName}</Text>

        <Text style={styles.itemText}>设备ID: {item.device.id}</Text>

      
      </View>
    </View>
      );
  };

  const testCampass = async () => {
    const angle = await getCompassDirection()
    if(!angle) return;
    setUserAngle(angle);
    console.log('用户角度', angle);
  };


  return (
    <View style={styles.container}>
      <Button title="Scan Devices" color={isSearchBle? 'red': 'blue'}onPress={()=>{isSearchBle? setIsSearchBle(false):setIsSearchBle(true)}} />
      <Button title="获取RSSI值" color='green' onPress={()=>{setIsAllowRssiScan(true)}} />
      {calculateForDistance? <Button title="停止计算位置" color='red' onPress={()=>{setCalculateForDistance(false)}} />: <Button title="计算位置" color='pink' onPress={()=>{setCalculateForDistance(true)}} />}
      <Button title="获取坐标" color='orange' onPress={()=>{setCalculateForDistance(!calculateForDistance)}} />
      <Text>用户坐标:{userAngle},{userPosition.x},{userPosition.y}</Text>
      
      <FlatList
        data={connectedDevicesInfo}
        renderItem={renderDeviceInfoDisp}
        keyExtractor={(item, index) => index.toString()}
      />
    </View>
  );

};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContainer: {
    backgroundColor: '#fff',
    padding: 20,
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 2,
  },
  itemText: {
    fontSize: 16,
    color: '#000', // 添加这行，确保文字颜色为黑色
  },
});

const App = () => {
  return (
    <BleManagerContextProvider>
      <ContextApp />
    </BleManagerContextProvider>
  );
}

export default App;